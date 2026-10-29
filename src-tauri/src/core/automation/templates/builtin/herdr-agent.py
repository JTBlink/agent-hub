"""Start an interactive agent in an explicit Herdr session and project directory."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import shlex
import subprocess
import sys
import uuid

HERE = Path(__file__).resolve().parent
STATE = HERE / ".herdr-run.json"


class HerdrError(RuntimeError):
    def __init__(self, message, code="unknown"):
        super().__init__(message)
        self.code = code


def command(binary, args, timeout=40, text_output=False):
    result = subprocess.run([binary, *args], capture_output=True, text=True,
                            encoding="utf-8", timeout=timeout, check=False)
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


def previous_agent(invoke, previous, session, cwd):
    if not previous:
        return None
    if previous.get("session") != session or previous.get("cwd") != str(cwd):
        if previous.get("phase") != "completed":
            raise HerdrError("上次 Herdr 任务未确认完成，请先处理原会话后再更换目标。")
        return None
    if not previous.get("pane"):
        raise HerdrError("上次 Herdr 布局创建结果未确认，请在 Herdr 检查后处理 .herdr-run.json。")
    try:
        return invoke(["agent", "get", previous["pane"]])["agent"]
    except HerdrError as error:
        if error.code != "agent_not_found":
            raise
    # An absent agent can also mean the pane now hosts the user's shell or editor.
    # Only a confirmed closed pane permits automatic layout recreation.
    try:
        invoke(["pane", "get", previous["pane"]])
    except HerdrError as error:
        if error.code != "pane_not_found":
            raise
        print(f"上次 Herdr 面板 {previous['pane']} 已关闭，将重新创建任务标签页。", flush=True)
        return None
    raise HerdrError("原 Herdr 面板仍存在但 Agent 已退出，请检查该面板后处理 .herdr-run.json。")


def verify_previous_agent(agent, previous, cwd):
    prefix = "ah-" + hashlib.sha256(str(HERE).encode()).hexdigest()[:8] + "-"
    name = agent.get("name", "")
    expected = previous.get("agent_name")
    owned = name == expected if expected else name.startswith(prefix)
    actual_cwd = agent.get("foreground_cwd") or agent.get("cwd")
    if not owned or (actual_cwd and Path(actual_cwd).resolve() != cwd):
        raise HerdrError("原面板的 Agent 或项目已更换，请检查后处理 .herdr-run.json。")
    if agent["agent_status"] not in ("idle", "done"):
        raise HerdrError("原 Agent 状态已变化，保留面板且不发起新任务。")


def create_task_pane(invoke, previous, agent, session, cwd, title):
    if agent:
        verify_previous_agent(agent, previous, cwd)
        save_state({**previous, "phase": "attention"})
        # Replace only this task's finished agent pane, keeping its tab and sidecars.
        return invoke(["pane", "split", previous["pane"], "--direction", "right",
                       "--cwd", str(cwd), "--no-focus"])["pane"]
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
        return invoke(["tab", "create", "--workspace", matches[0]["workspace_id"],
                       "--cwd", str(cwd), "--label", title, "--no-focus"])["root_pane"]
    return invoke(["workspace", "create", "--cwd", str(cwd),
                   "--label", cwd.name, "--no-focus"])["root_pane"]


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
    additional = config.get("extra_arguments", "")
    if not isinstance(additional, str) or "\0" in additional:
        raise HerdrError("额外的智能体参数必须是文本，且不能包含空字符。")
    try:
        extra = [*extra, *shlex.split(additional)]
    except ValueError:
        raise HerdrError("额外的智能体参数引号未闭合，请检查高级设置。") from None
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
    invoke = lambda args, timeout=40, text_output=False: command(binary, prefix + args, timeout, text_output)
    previous = None
    if STATE.exists():
        previous = json.loads(STATE.read_text(encoding="utf-8"))
    agent = previous_agent(invoke, previous, session, cwd)
    if agent:
        status = agent["agent_status"]
        if status == "working":
            print(f"上次 Herdr 任务仍在运行：{previous['pane']}；跳过本次触发，不排队或重复发起。", flush=True)
            return 0
        if status not in ("idle", "done") or previous.get("phase") == "attention":
            print(f"保留上次会话：{previous['pane']}，状态 {status}；不重复发起。", flush=True)
            return 1
    created = create_task_pane(invoke, previous, agent, session, cwd, config.get("title", "AgentHub task"))
    pane = created["pane_id"]
    name = "ah-" + hashlib.sha256(str(HERE).encode()).hexdigest()[:8] + "-" + uuid.uuid4().hex[:6]
    state = {"session": session, "pane": pane, "cwd": str(cwd), "workspace": created["workspace_id"],
             "tab": created.get("tab_id"), "agent_name": name, "phase": "attention"}
    save_state(state)
    if agent:
        verify_previous_agent(invoke(["agent", "get", previous["pane"]])["agent"], previous, cwd)
        invoke(["pane", "close", previous["pane"]])
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
    status = result["agent"]["agent_status"]
    state["phase"] = "completed" if status in ("idle", "done") else "attention"
    save_state(state)
    # Scrolling application history is only safe once the agent is idle.
    source = ["--source", "recent-unwrapped", "--lines", "160"] if state["phase"] == "completed" else ["--source", "visible"]
    output = invoke(["agent", "read", name, *source], text_output=True)
    print(output, flush=True)
    print(f"Herdr 会话状态：{status}。请在 Herdr 查看任务结果；会话就绪不代表验证已通过。")
    return 0 if state["phase"] == "completed" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (HerdrError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        sys.exit(f"Herdr 任务未完成：{error}。保留现有会话，不自动重发或回答审批。")
