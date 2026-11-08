"""Shared managed Agent lifecycle. Callers supply paths and business context explicitly."""
from pathlib import Path
import json
import os
import re
import runpy
import shutil
import shlex
import subprocess
import sys

REQUEST = globals().get("EXECUTION_REQUEST")
if REQUEST is None and __name__ == "__main__":
    REQUEST = json.load(sys.stdin)
REQUEST = REQUEST or {}
HERE = Path(REQUEST.get("identity_directory", ".")).resolve()
STATE_DIR = Path(REQUEST.get("state_directory", ".")).resolve()
STATE = STATE_DIR / ".herdr-run.json"


class HerdrError(RuntimeError):
    def __init__(self, message, code="unknown"):
        super().__init__(message)
        self.code = code


def command(binary, args, timeout=40, text_output=False):
    result = subprocess.run([binary, *args], capture_output=True, text=True,
                            encoding="utf-8", timeout=timeout, check=False,
                            creationflags=0x08000000 if os.name == 'nt' else 0)
    # Read commands print terminal text, including text that happens to be JSON.
    # Failures still use the CLI's JSON error envelope on stderr.
    if text_output and result.returncode == 0:
        return result.stdout
    try:
        response = json.loads((result.stderr or result.stdout) if result.returncode
                              else result.stdout)
    except ValueError:
        raise HerdrError("Herdr 返回无效响应；请检查服务和 CLI 版本。") from None
    if not isinstance(response, dict):
        raise HerdrError("Herdr 返回无效响应；请检查服务和 CLI 版本。")
    if result.returncode or "error" in response:
        error = response.get("error", {})
        if isinstance(error, dict):
            raise HerdrError(error.get("message", "Herdr 命令失败"), error.get("code", "unknown"))
        raise HerdrError(response.get("message") or str(error), response.get("code", "unknown"))
    return response.get("result", response)


def save_state(state):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    temporary.replace(STATE)


def read_bundle(path):
    text = path.read_text(encoding="utf-8-sig")
    if text.startswith("# AgentHub automation script:"):
        text = text.partition("\n")[2]
    return text


def terminal_fallback(bridge, kind, arguments, prompt, cwd):
    if not bridge:
        raise HerdrError("Herdr 未安装，且没有可用的 AgentHub CLI；无法创建终端执行任务。")
    previous = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else None
    receipt_path = STATE_DIR / ".terminal-run.json"
    if previous and previous.get("phase") != "completed":
        if previous.get("backend") != "terminal":
            raise HerdrError("上次 Herdr 任务结果尚未确认，不能降级重跑同一任务。")
        receipt = json.loads(receipt_path.read_text(encoding="utf-8")) if receipt_path.exists() else None
        if not receipt:
            raise HerdrError("上次终端启动结果不明，请先检查系统终端；不重复执行。")
        observed = command(bridge, ["--json", "agents", "launch", "terminal-status", receipt["id"]])
        if observed["phase"] != "exited":
            print("上次任务仍在原生终端执行或等待确认，跳过本轮触发。", flush=True)
            return 0
        save_state({**previous, "phase": "completed"})
        print("原生终端进程已退出；请核对任务结果，不以进程退出代替业务验收。", flush=True)
        return observed.get("exit_code") or 0
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    receipt_path.unlink(missing_ok=True)
    prompt_path = STATE_DIR / ".terminal-prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    save_state({"backend": "terminal", "phase": "attention", "cwd": str(cwd)})
    try:
        command(bridge, ["--json", "agents", "launch", "terminal", kind, "--cwd", str(cwd),
                         "--prompt-file", str(prompt_path), "--arguments-json", json.dumps(arguments),
                         "--receipt-file", str(receipt_path)])
    finally:
        prompt_path.unlink(missing_ok=True)
    print("Herdr 未安装，任务已提交到原生终端；后续触发将核对回执，不重复发起。", flush=True)
    return 0


def main(prompt_context=""):
    binary = shutil.which("herdr")
    config_path = Path(REQUEST["config_file"])
    config = json.loads(read_bundle(config_path))
    session = config.get("session", "default")
    kind = config.get("agent", "codex")
    if not isinstance(session, str) or not session or session.startswith("-"):
        raise HerdrError("Herdr 会话名称无效。")
    if not isinstance(kind, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,31}", kind):
        raise HerdrError("智能体类型无效；须使用 Herdr 支持的 Agent 类型。")
    explicit = config.get("arguments")
    if explicit is not None and (not isinstance(explicit, list) or not all(isinstance(arg, str) and not any(c in arg for c in "\0\r\n") for arg in explicit)):
        raise HerdrError("Herdr 智能体参数必须是单行字符串数组。")
    additional = config.get("extra_arguments", "")
    if not isinstance(additional, str) or any(c in additional for c in "\0\r\n"):
        raise HerdrError("额外的智能体参数必须是单行文本。")
    try:
        additional = shlex.split(additional)
    except ValueError:
        raise HerdrError("额外的智能体参数引号未闭合，请检查详细设置。") from None
    bridge = os.environ.get("AGENT_HUB_CLI")
    if not bridge:
        directory = Path.home() / ".agent-hub/bin"
        candidate = directory / ("agent-hub-cli.exe" if os.name == "nt" else "agent-hub-cli")
        stamp = directory / ".version"
        if candidate.exists() or stamp.exists():
            if not candidate.is_file() or not stamp.is_file() or not stamp.stat().st_size:
                raise HerdrError("AgentHub CLI bridge 不完整，请更新应用后重试。")
            bridge = str(candidate)
        else:
            bridge = shutil.which("agent-hub-cli")
    if bridge:
        environment = command(bridge, ["--json", "agents", "launch", "environment"])
        binary = environment.get("herdr_path")
        resolved = command(bridge, ["--json", "agents", "launch", "resolve", kind])
        kind = resolved.get("kind")
        if not kind:
            raise HerdrError("所选 Agent 不支持 Herdr CLI 启动，请更换智能体。")
        # Managed AgentHub tasks always inherit the current global launch
        # instruction.  `arguments` remains readable for old exported tasks,
        # but must not freeze a scheduled task to the settings it had when it
        # was created.  Task-specific `extra_arguments` is appended below.
        extra = list(resolved["arguments"])
    elif explicit is not None and kind != "default":
        # Old exported tasks remain standalone when all arguments are explicit.
        extra = list(explicit)
    else:
        raise HerdrError("未找到 AgentHub CLI；请更新应用以读取全局启动指令，或显式配置任务参数。")
    extra.extend(additional)
    # Keep the unattended updater guard even when a task replaces all arguments.
    if kind == "codex" and "check_for_update_on_startup=false" not in extra:
        extra = ["-c", "check_for_update_on_startup=false", *extra]
    prompt_path = Path(REQUEST["prompt_file"])
    prompt = read_bundle(prompt_path).strip()
    if not prompt:
        raise HerdrError("提示词为空，请填写任务提示词。")
    if prompt_context:
        prompt += "\n\n" + prompt_context
    cwd = Path(REQUEST["workdir"]).resolve()
    # Refuse the default task storage directory: it is not a chosen project.
    if cwd == HERE or cwd == HERE.parent:
        raise HerdrError("请先选择项目工作区，Agent 将在该项目目录运行。")
    previous_state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    if not binary or (previous_state.get("backend") == "terminal" and previous_state.get("phase") != "completed"):
        return terminal_fallback(bridge, kind, extra, prompt, cwd)
    backend_path = os.environ.get('AGENT_HUB_HERDR_RUNTIME')
    if not backend_path:
        raise HerdrError('当前构建不提供 Herdr 执行能力。')
    backend = runpy.run_path(backend_path, init_globals={
        'HerdrError': HerdrError, 'command': command, 'save_state': save_state,
        'HERE': HERE, 'STATE': STATE, 'STATE_DIR': STATE_DIR,
    })
    return backend['run'](binary, config, session, kind, extra, prompt, cwd, bridge)


if __name__ == "__main__":
    try:
        store = runpy.run_path(os.environ['AGENT_HUB_STATE_RUNTIME'])
        with store['RunLock'](STATE_DIR / '.agent-execution.lock') as acquired:
            if not acquired:
                print('上次 Agent 执行仍在运行，本次跳过。', flush=True)
                sys.exit(0)
            sys.exit(main(prompt_context=REQUEST.get("prompt_context", "")))
    except (HerdrError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        sys.exit(f"Herdr 任务未完成：{str(error).rstrip('。')}。保留现有会话，不自动重发或回答审批。")
