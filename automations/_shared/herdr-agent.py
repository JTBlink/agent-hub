"""Start an interactive agent in an explicit Herdr session and project directory."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import shlex
import subprocess
import sys
import time
import uuid

HERE = Path(__file__).resolve().parent
TASK = Path(os.environ.get("AGENT_HUB_TASK_DIR", str(HERE.parent if HERE.name == "scripts" else HERE)))
STATE_DIR = Path(os.environ.get("AGENT_HUB_STATE_DIR", str(TASK / ".local" / "state" if HERE.name == "scripts" else HERE)))
STATE = STATE_DIR / ".herdr-run.json"


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
    STATE.parent.mkdir(parents=True, exist_ok=True)
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
        return None, None
    if previous.get("session") != session or previous.get("cwd") != str(cwd):
        if previous.get("phase") != "completed":
            raise HerdrError("上次 Herdr 任务未确认完成，请先处理原会话后再更换目标。")
        return None, None
    if not previous.get("pane"):
        raise HerdrError("上次 Herdr 布局创建结果未确认，请在 Herdr 检查后处理 .herdr-run.json。")
    try:
        return invoke(["agent", "get", previous["pane"]])["agent"], None
    except HerdrError as error:
        if error.code != "agent_not_found":
            raise
    # An absent agent can also mean the pane now hosts the user's shell or editor.
    # Only a confirmed closed pane permits automatic layout recreation.
    try:
        pane = invoke(["pane", "get", previous["pane"]])["pane"]
    except HerdrError as error:
        if error.code != "pane_not_found":
            raise
        print(f"上次 Herdr 面板 {previous['pane']} 已关闭，将重新创建任务标签页。", flush=True)
        return None, None
    may_start = not previous.get("replacement_pending") and (
        previous.get("phase") in ("starting", "completed") or previous.get("prompt_attempted") is False
    )
    if may_start and not pane.get("agent"):
        actual_cwd = pane.get("foreground_cwd") or pane.get("cwd")
        if not actual_cwd or Path(actual_cwd).resolve() != cwd:
            raise HerdrError("原 Herdr 面板的项目目录已更换，保留面板且不启动任务。")
        info = invoke(["pane", "process-info", "--pane", previous["pane"]])["process_info"]
        foreground = info.get("foreground_processes", [])
        shell_pid = info.get("shell_pid")
        if shell_pid and len(foreground) == 1 and foreground[0].get("pid") == shell_pid:
            print(f"原 Herdr 面板 {previous['pane']} 已回到 shell，将在原面板启动新 Agent。", flush=True)
            return None, pane
        raise HerdrError("原面板仍在执行启动或其他命令，跳过本次触发。", "pane_busy")
    raise HerdrError("原 Herdr 面板仍存在但 Agent 已退出，请检查该面板后处理 .herdr-run.json。")


def verify_agent_identity(agent, previous, cwd):
    prefix = "ah-" + hashlib.sha256(str(HERE).encode()).hexdigest()[:8] + "-"
    name = agent.get("name", "")
    expected = previous.get("agent_name")
    owned = name == expected if expected else name.startswith(prefix)
    actual_cwd = agent.get("foreground_cwd") or agent.get("cwd")
    if not owned or (actual_cwd and Path(actual_cwd).resolve() != cwd):
        raise HerdrError("原面板的 Agent 或项目已更换，请检查后处理 .herdr-run.json。")


def verify_previous_agent(agent, previous, cwd):
    verify_agent_identity(agent, previous, cwd)
    if agent["agent_status"] not in ("idle", "done"):
        raise HerdrError("原 Agent 状态已变化，保留面板且不发起新任务。")


def create_task_pane(invoke, previous, agent, session, cwd, title, available_pane=None):
    if available_pane:
        return available_pane
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


def wait_for_result(invoke, name, baseline_seq):
    deadline = time.monotonic() + 1800
    observed_activity = False
    last_status = None
    while time.monotonic() < deadline:
        agent = invoke(["agent", "get", name])["agent"]
        status = agent["agent_status"]
        observed_activity = observed_activity or status in ("working", "blocked")
        completed = (agent.get("completion_seq") or 0) > baseline_seq
        if status != last_status:
            description = {"unknown": "状态识别中", "working": "正在执行",
                           "blocked": "等待输入", "idle": "等待执行结果", "done": "已结束"}.get(status, status)
            print(f"Herdr 任务进行中：{description}。", flush=True)
            last_status = status
        if status == "blocked" or (status in ("idle", "done") and (observed_activity or completed)):
            return {"agent": agent}
        time.sleep(2)
    raise HerdrError("等待 Herdr 任务结果超时；会话已保留，请在 Herdr 查看进展。", "timeout")


def finish_result(invoke, state, result, target):
    status = result["agent"]["agent_status"]
    state["phase"] = "completed" if status in ("idle", "done") else "attention"
    save_state(state)
    # Scrolling application history is only safe once the agent is idle.
    source = ["--source", "recent-unwrapped", "--lines", "160"] if state["phase"] == "completed" else ["--source", "visible"]
    output = invoke(["agent", "read", target, *source], text_output=True)
    print(output, flush=True)
    print(f"Herdr 会话状态：{status}。请在 Herdr 查看任务结果；会话就绪不代表验证已通过。")
    return 0 if state["phase"] == "completed" else 1


def main():
    binary = shutil.which("herdr")
    if not binary:
        raise HerdrError("未找到 Herdr CLI，请安装 Herdr 并启动本地服务。")
    config = json.loads(read_bundle(TASK / "herdr.json"))
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
    # Unattended tasks must not stop at the CLI's interactive updater and exit.
    if kind == "codex":
        extra = ["-c", "check_for_update_on_startup=false", *extra]
    prompt = read_bundle(TASK / "prompt.md").strip()
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
    try:
        agent, available_pane = previous_agent(invoke, previous, session, cwd)
    except HerdrError as error:
        if error.code != "pane_busy":
            raise
        print(error, flush=True)
        return 0
    if agent:
        verify_agent_identity(agent, previous, cwd)
        status = agent["agent_status"]
        if status == "working":
            print(f"上次 Herdr 任务仍在运行：{previous['pane']}；跳过本次触发，不排队或重复发起。", flush=True)
            return 0
        if status == "unknown":
            if previous.get("phase") == "starting" and previous.get("prompt_attempted") is False:
                print("上次 Herdr Agent 仍在启动，跳过本次触发；尚未投递提示词。", flush=True)
                return 0
            target = previous.get("agent_name") or previous["pane"]
            print(f"保留上次 Herdr 会话 {previous['pane']}，继续等待状态与结果；不重复投递。", flush=True)
            result = wait_for_result(invoke, target, previous.get("completion_seq") or 0)
            return finish_result(invoke, previous, result, target)
        if previous.get("phase") == "attention" and status == "done" and (
            (agent.get("completion_seq") or 0) > (previous.get("completion_seq") or 0)
        ):
            verify_previous_agent(agent, previous, cwd)
            print("上次 Herdr Agent 已完成，仅收回已有结果；本次不重复投递。", flush=True)
            return finish_result(invoke, previous, {"agent": agent}, previous["pane"])
        if status not in ("idle", "done") or previous.get("phase") == "attention":
            print(f"保留上次会话：{previous['pane']}，状态 {status}；不重复发起。", flush=True)
            return 1
    created = create_task_pane(invoke, previous, agent, session, cwd, config.get("title", "AgentHub task"), available_pane)
    pane = created["pane_id"]
    name = "ah-" + hashlib.sha256(str(HERE).encode()).hexdigest()[:8] + "-" + uuid.uuid4().hex[:6]
    state = {"session": session, "pane": pane, "cwd": str(cwd), "workspace": created["workspace_id"],
             "tab": created.get("tab_id"), "agent_name": name, "phase": "starting", "prompt_attempted": False}
    if agent:
        state["replacement_pending"] = previous["pane"]
    save_state(state)
    if agent:
        verify_previous_agent(invoke(["agent", "get", previous["pane"]])["agent"], previous, cwd)
        invoke(["pane", "close", previous["pane"]])
        state.pop("replacement_pending")
        save_state(state)
    print(f"Herdr 会话 {session}，Agent {name}，面板 {pane}。", flush=True)
    started = invoke(["agent", "start", name, "--kind", kind, "--pane", pane,
                      "--timeout", "30000", *(["--", *extra] if extra else [])])
    # Persist before submission: timeout does not prove the prompt was not delivered.
    state["phase"] = "submitted"
    state["prompt_attempted"] = True
    state["completion_seq"] = started.get("agent", {}).get("completion_seq") or 0
    save_state(state)
    try:
        try:
            invoke(["agent", "prompt", name, prompt])
        except HerdrError as error:
            if error.code != "agent_prompt_stalled":
                raise
            print("Herdr 已投递提示词，正在等待 Agent 状态更新；不会重复投递。", flush=True)
        result = wait_for_result(invoke, name, state["completion_seq"])
    except (HerdrError, subprocess.TimeoutExpired):
        state["phase"] = "attention"
        save_state(state)
        raise
    return finish_result(invoke, state, result, name)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (HerdrError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        sys.exit(f"Herdr 任务未完成：{str(error).rstrip('。')}。保留现有会话，不自动重发或回答审批。")
