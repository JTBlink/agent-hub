"""Herdr-specific managed execution: ownership, layout, observation and recovery.

The shared Agent executor supplies checkpoint storage and command transport.
Startup is delegated to the same configured Rust launcher used by interactive entry points.
"""
from pathlib import Path
import hashlib
import math
import subprocess
import time
import uuid
import json
import re


def prompt_digest(text):
    # Terminal wrapping and NBSP change whitespace, but never the input's words.
    return hashlib.sha256(" ".join(text.split()).encode()).hexdigest()


def confirm_pending_input(invoke, state):
    """Submit a verified Claude draft once; never replay its text or guess at input."""
    delivery = state.get("delivery", {})
    if not delivery.get("digest") or delivery.get("enter_attempted"):
        return False
    target = state["pane"]
    agent = invoke(["agent", "get", target])["agent"]
    if (agent.get("agent") != "claude" or agent.get("agent_status") != "idle" or not agent.get("agent_session")
            or (agent.get("completion_seq") or 0) > state.get("completion_seq", 0)):
        return False
    verify_agent_identity(agent, state, Path(state["cwd"]))
    text = invoke(["agent", "read", target, "--source", "visible"], text_output=True)
    blocks = re.split(r"(?m)^[─━]{8,}[^\S\n]*$", text)
    if len(blocks) < 3:
        return False
    draft = blocks[-2].strip()
    if not draft.startswith("❯") or prompt_digest(draft[1:]) != delivery["digest"]:
        return False
    current = invoke(["agent", "get", target])["agent"]
    verify_agent_identity(current, state, Path(state["cwd"]))
    if (current.get("agent") != "claude" or current.get("agent_status") != "idle" or current.get("agent_session") != agent.get("agent_session")
            or current.get("revision") != agent.get("revision")
            or (current.get("completion_seq") or 0) > state.get("completion_seq", 0)):
        return False
    # Persist before the key: an uncertain reply cannot authorize a second Enter.
    delivery["enter_attempted"] = True
    save_state(state)
    invoke(["agent", "send-keys", target, "enter"])
    print("已核对原输入框完整消息，补交一次确认键；没有重发提示词，继续核验 Agent 活动。", flush=True)
    return True


def submit_prompt(invoke, state, prompt):
    state["delivery"] = {"digest": prompt_digest(prompt), "enter_attempted": False}
    save_state(state)
    try:
        invoke(["agent", "prompt", state.get("agent_name") or state["pane"], prompt,
                "--wait", "--until", "working", "--until", "blocked", "--until", "done", "--timeout", "7000"])
        return True
    except HerdrError as error:
        if error.code not in ("agent_prompt_stalled", "timeout"):
            raise
        if confirm_pending_input(invoke, state):
            # The key receipt alone is not delivery evidence.
            deadline = time.monotonic() + 7
            while time.monotonic() < deadline:
                agent = invoke(["agent", "get", state["pane"]])["agent"]
                verify_agent_identity(agent, state, Path(state["cwd"]))
                if agent.get("agent_status") in ("working", "blocked") or (
                        (agent.get("completion_seq") or 0) > state.get("completion_seq", 0)):
                    return True
                time.sleep(1)
        if error.code == "timeout":
            raise
        print("提示词提交尚未确认，保留原会话继续观察；不会重复投递。", flush=True)
        return False

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


def wait_for_result(invoke, name, baseline_seq, timeout_seconds=1800):
    deadline = time.monotonic() + timeout_seconds
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


def submit_and_collect(invoke, state, prompt, wait_timeout_seconds, recovery=None):
    # Persist before submission: timeout does not prove the prompt was not delivered.
    save_state(state)
    try:
        delivered = submit_prompt(invoke, state, prompt)
        if recovery:
            if not delivered:
                return 1
            state["recovery"]["status"] = "submitted"
            state["continuation"]["status"] = "submitted"
            save_state(state)
            return 0
        result = wait_for_result(invoke, state["agent_name"], state["completion_seq"], wait_timeout_seconds)
    except (HerdrError, subprocess.TimeoutExpired):
        state["phase"] = "attention"
        save_state(state)
        raise
    return finish_result(invoke, state, result, state["agent_name"])


def session_age(previous, now):
    """Seconds since this task started the Agent; records from before the start time existed count from now."""
    if "agent_started_at" not in previous:
        return 0
    started = previous["agent_started_at"]
    if isinstance(started, bool) or not isinstance(started, (int, float)):
        return None
    age = now - started
    return age if math.isfinite(age) and age >= 0 else None


def describe_duration(seconds):
    minutes = int(seconds // 60)
    return f"{minutes // 60} 小时 {minutes % 60} 分钟" if minutes >= 60 else f"{minutes} 分钟"


def reuse_agent(invoke, previous, agent, cwd, prompt, wait_timeout_seconds, started):
    """Continue a finished round in the same conversation; identity and layout stay unchanged."""
    verify_previous_agent(agent, previous, cwd)
    state = {**previous, "phase": "submitted", "prompt_attempted": True,
             "completion_seq": agent.get("completion_seq") or 0, "agent_started_at": started}
    return submit_and_collect(invoke, state, prompt, wait_timeout_seconds)


def continue_existing(invoke, previous, agent, cwd, prompt, continuation_id):
    verify_previous_agent(agent, previous, cwd)
    prior = previous.get("continuation", {})
    if prior.get("id") == continuation_id:
        print("同一续作已尝试投递，保留结果且不重复发送。", flush=True)
        return 0
    if prior.get("status") == "uncertain" and (agent.get("completion_seq") or 0) <= (previous.get("completion_seq") or 0):
        raise HerdrError("上次续作投递结果仍不明确，先核对原会话，不重复发送。")
    state = {**previous, "phase": "submitted", "completion_seq": agent.get("completion_seq") or 0,
             "continuation": {"id": continuation_id, "status": "uncertain"}}
    save_state(state)
    if not submit_prompt(invoke, state, prompt):
        return 1
    state["continuation"]["status"] = "submitted"
    save_state(state)
    print("续作已投递到原 Agent，会话和业务身份保持不变；未创建新 Agent。", flush=True)
    return 0


def run(binary, config, session, kind, extra, prompt, cwd, bridge, title, wait_timeout_seconds=1800,
        reconcile_only=False, continuation_prompt="", continuation_id="", recover_closed=False, recovery_pane=""):
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
            if reconcile_only and previous.get("phase") == "completed":
                save_state({**previous, "phase": "attention"})
            print(f"上次 Herdr 任务仍在运行：{previous['pane']}；跳过本次触发，不排队或重复发起。", flush=True)
            return 0
        if status == "unknown":
            if reconcile_only:
                if previous.get("phase") == "completed":
                    save_state({**previous, "phase": "attention"})
                print("原 Agent 状态尚未确认，仅保留已有执行，不投递任务。", flush=True)
                return 0
            if previous.get("phase") == "starting" and previous.get("prompt_attempted") is False:
                print("上次 Herdr Agent 仍在启动，跳过本次触发；尚未投递提示词。", flush=True)
                return 0
            target = previous.get("agent_name") or previous["pane"]
            print(f"保留上次 Herdr 会话 {previous['pane']}，继续等待状态与结果；不重复投递。", flush=True)
            result = wait_for_result(invoke, target, previous.get("completion_seq") or 0,
                                     wait_timeout_seconds)
            return finish_result(invoke, previous, result, target)
        if continuation_prompt:
            return continue_existing(invoke, previous, agent, cwd, continuation_prompt, continuation_id)
        if previous.get("phase") in ("submitted", "attention") and status in ("idle", "done") and (
            (agent.get("completion_seq") or 0) > (previous.get("completion_seq") or 0)
        ):
            verify_previous_agent(agent, previous, cwd)
            print("上次 Herdr Agent 已完成，仅收回已有结果；本次不重复投递。", flush=True)
            return finish_result(invoke, previous, {"agent": agent}, previous["pane"])
        if previous.get("phase") == "submitted" and status in ("idle", "done"):
            print('旧提示词已尝试投递，但还没有可核实的完成记录；保留原 Agent，不重复发起。', flush=True)
            return 1
        if status not in ("idle", "done") or previous.get("phase") == "attention":
            print(f"保留上次会话：{previous['pane']}，状态 {status}；不重复发起。", flush=True)
            return 1
    reuse_seconds = config["execution"].get("session_reuse_seconds", 0)
    if agent and reuse_seconds and not reconcile_only and previous.get("phase") == "completed":
        now = time.time()
        # Only a named Agent can be addressed again; older records are replaced instead.
        age = session_age(previous, now) if previous.get("agent_name") else None
        limit = describe_duration(reuse_seconds)
        if age is not None and age < reuse_seconds:
            note = "" if "agent_started_at" in previous else "（旧记录没有启动时间，从本轮开始计时）"
            print(f"复用原 Agent {previous['agent_name']}（面板 {previous['pane']}）：会话已运行 "
                  f"{describe_duration(age)}{note}，复用上限 {limit}；本轮在原会话继续。", flush=True)
            return reuse_agent(invoke, previous, agent, cwd, prompt, wait_timeout_seconds,
                               previous.get("agent_started_at", int(now)))
        if age is None:
            print("原 Agent 记录无法确认运行时长；本轮在原标签页换新 Agent。", flush=True)
        else:
            print(f"原 Agent 会话已运行 {describe_duration(age)}，达到复用上限 {limit}；"
                  "本轮在原标签页换新 Agent。", flush=True)
    recovery = None
    if recover_closed and not agent:
        if not previous or available_pane or previous.get("session") != session or previous.get("cwd") != str(cwd):
            raise HerdrError("恢复须核实原任务已关闭的面板及项目；不接管现有 Shell。")
        prior = previous.get("continuation", {})
        if prior.get("status") in ("requested", "uncertain") or previous.get("phase") not in ("completed", "submitted"):
            raise HerdrError("原执行或提示词送达未决，不能创建恢复 Agent。")
        if previous.get("recovery", {}).get("id") == continuation_id:
            raise HerdrError("同一恢复已尝试，不重复创建 Agent；先核验原回执。")
        if not continuation_prompt or not continuation_id:
            raise HerdrError("恢复须提供明确提示词与唯一 ID。")
        try:
            invoke(["agent", "get", previous["agent_name"]])
        except HerdrError as error:
            if error.code != "agent_not_found":
                raise
        else:
            raise HerdrError("原 Agent 仍存在，不能创建第二个执行者。")
        archive = STATE_DIR / ("closed-agent-" + uuid.uuid4().hex + ".json")
        # The shared caller lock is held; preserve the original receipt before layout changes.
        save_state(previous, archive)
        recovery = {"id": continuation_id, "previous_checkpoint": str(archive), "status": "requested"}
        prompt = continuation_prompt
        if recovery_pane:
            available_pane = invoke(["pane", "get", recovery_pane])["pane"]
            actual = available_pane.get("foreground_cwd") or available_pane.get("cwd")
            if available_pane.get("agent") or not actual or Path(actual).resolve() != cwd:
                raise HerdrError("恢复目标面板非空或项目不匹配，未启动。")
    if reconcile_only and not recovery:
        print("本次仅核对已有执行，不创建面板、启动 Agent 或投递提示词。", flush=True)
        return 1 if previous and previous.get("phase") != "completed" else 0
    created = create_task_pane(invoke, previous, agent, session, cwd, title, available_pane)
    pane = created["pane_id"]
    name = "ah-" + hashlib.sha256(str(HERE).encode()).hexdigest()[:8] + "-" + uuid.uuid4().hex[:6]
    state = {"session": session, "pane": pane, "cwd": str(cwd), "workspace": created["workspace_id"],
             "tab": created.get("tab_id"), "agent_name": name, "phase": "starting", "prompt_attempted": False,
             "agent_started_at": int(time.time())}
    if recovery:
        state["recovery"] = recovery
        state["continuation"] = {"id": continuation_id, "status": "uncertain"}
    if agent:
        state["replacement_pending"] = previous["pane"]
    save_state(state)
    if agent:
        verify_previous_agent(invoke(["agent", "get", previous["pane"]])["agent"], previous, cwd)
        invoke(["pane", "close", previous["pane"]])
        state.pop("replacement_pending")
        save_state(state)
    print(f"Herdr 会话 {session}，Agent {name}，面板 {pane}。", flush=True)
    # Every executable uses core/herdr/agents, just like the sidebar and terminal.
    # Its startup rules (including shell readiness) have one authoritative implementation.
    started = command(bridge, ["--json", "agents", "launch", "start", kind,
                              "--session", session, "--pane", pane, "--name", name,
                              "--arguments-json", json.dumps(extra)], timeout=80)
    state["phase"] = "submitted"
    state["prompt_attempted"] = True
    state["completion_seq"] = started.get("agent", {}).get("completion_seq") or 0
    return submit_and_collect(invoke, state, prompt, wait_timeout_seconds, recovery)
