"""Start an interactive agent in an explicit Herdr session and project directory."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
import sys
import uuid

HERE = Path(__file__).resolve().parent
STATE = HERE / ".herdr-run.json"


class HerdrError(RuntimeError):
    def __init__(self, message, code="unknown"):
        super().__init__(message)
        self.code = code


def command(binary, args, timeout=40):
    result = subprocess.run([binary, *args], capture_output=True, text=True,
                            encoding="utf-8", timeout=timeout, check=False)
    try:
        response = json.loads(result.stdout or result.stderr)
    except ValueError:
        raise HerdrError("Herdr 返回无效响应；请检查服务和 CLI 版本。") from None
    if result.returncode or "error" in response:
        error = response.get("error", {})
        raise HerdrError(error.get("message", "Herdr 命令失败"), error.get("code", "unknown"))
    return response.get("result", response)


def save_state(state):
    temporary = STATE.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    temporary.replace(STATE)


def read_bundle(path):
    text = path.read_text(encoding="utf-8-sig")
    if text.startswith("# AgentHub automation script:"):
        text = text.partition("\n")[2]
    return text


def main():
    binary = shutil.which("herdr")
    if not binary:
        raise HerdrError("未找到 Herdr CLI，请安装 Herdr 并启动本地服务。")
    config = json.loads(read_bundle(HERE / "herdr.json"))
    session = config.get("session", "default")
    kind = config.get("agent", "codex")
    if not isinstance(session, str) or not session or session.startswith("-"):
        raise HerdrError("Herdr 会话名称无效。")
    if not isinstance(kind, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,31}", kind):
        raise HerdrError("智能体类型无效；须使用 Herdr 支持的 Agent 类型。")
    extra = config.get("arguments", [])
    if not isinstance(extra, list) or not all(isinstance(arg, str) and "\0" not in arg for arg in extra):
        raise HerdrError("Herdr 智能体参数必须是字符串数组。")
    prompt = read_bundle(HERE / "prompt.md").strip()
    if not prompt:
        raise HerdrError("提示词为空，请填写任务提示词。")
    cwd = Path.cwd().resolve()
    # Refuse the default task storage directory: it is not a chosen project.
    if cwd == HERE or cwd == HERE.parent:
        raise HerdrError("请先选择项目工作区，Agent 将在该项目目录运行。")
    sessions = command(binary, ["session", "list", "--json"])["sessions"]
    if not any(item.get("name") == session and item.get("running") for item in sessions):
        raise HerdrError(f"Herdr 会话 {session} 未运行，请先在 Herdr 中启动该会话。")
    prefix = ["--session", session]
    invoke = lambda args, timeout=40: command(binary, prefix + args, timeout)
    previous = None
    if STATE.exists():
        previous = json.loads(STATE.read_text(encoding="utf-8"))
        if previous.get("phase") != "completed":
            if not previous.get("pane"):
                raise HerdrError("上次 Herdr 布局创建结果未确认，请在 Herdr 检查后处理 .herdr-run.json。")
            if previous.get("session") != session or previous.get("cwd") != str(cwd):
                raise HerdrError("上次 Herdr 任务未确认完成，请先处理原会话后再更换目标。")
            agent = invoke(["agent", "get", previous["pane"]])["agent"]
            status = agent["agent_status"]
            if status in ("working", "blocked", "unknown") or previous.get("phase") == "attention":
                print(f"保留上次会话：{previous['pane']}，状态 {status}；不重复发起。", flush=True)
                return 1 if status != "working" else 0
    workspaces = invoke(["workspace", "list"])["workspaces"]
    matches = [item for item in workspaces if (
        item.get("worktree") and Path(item["worktree"]["checkout_path"]).resolve() == cwd
    ) or (
        not item.get("worktree") and previous and previous.get("cwd") == str(cwd)
        and previous.get("session") == session and previous.get("workspace") == item["workspace_id"]
    )]
    if len(matches) > 1:
        raise HerdrError("多个 Herdr 工作区对应此项目，请保留一个目标工作区后重试。")
    save_state({"session": session, "cwd": str(cwd), "phase": "attention"})
    if matches:
        created = invoke(["tab", "create", "--workspace", matches[0]["workspace_id"],
                          "--cwd", str(cwd), "--label", config.get("title", "AgentHub task"), "--no-focus"])
    else:
        created = invoke(["workspace", "create", "--cwd", str(cwd),
                          "--label", cwd.name, "--no-focus"])
    pane = created["root_pane"]["pane_id"]
    name = "ah-" + hashlib.sha256(str(HERE).encode()).hexdigest()[:8] + "-" + uuid.uuid4().hex[:6]
    state = {"session": session, "pane": pane, "cwd": str(cwd), "workspace": created["root_pane"]["workspace_id"], "phase": "attention"}
    save_state(state)
    print(f"Herdr 会话 {session}，Agent {name}，面板 {pane}。", flush=True)
    invoke(["agent", "start", name, "--kind", kind, "--pane", pane,
            "--timeout", "30000", *(["--", *extra] if extra else [])])
    # Persist before submission: timeout does not prove the prompt was not delivered.
    state["phase"] = "submitted"
    save_state(state)
    try:
        result = invoke(["agent", "prompt", name, prompt, "--wait", "--timeout", "1800000"], 1810)
    except (HerdrError, subprocess.TimeoutExpired):
        state["phase"] = "attention"
        save_state(state)
        raise
    output = invoke(["agent", "read", name, "--source", "recent-unwrapped", "--lines", "160"])
    print(output.get("text", ""), flush=True)
    status = result["agent"]["agent_status"]
    state["phase"] = "completed" if status in ("idle", "done") else "attention"
    save_state(state)
    print(f"Herdr 会话状态：{status}。请在 Herdr 查看任务结果；会话就绪不代表验证已通过。")
    return 0 if state["phase"] == "completed" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (HerdrError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        sys.exit(f"Herdr 任务未完成：{error}。保留现有会话，不自动重发或回答审批。")
