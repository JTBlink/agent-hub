"""Run with Vite available: browser-use < tests/browser/local-skill-delete.py.

IPC gates exercise the real panel, hook and confirmation dialog. No real
filesystem calls are made. These helpers are supplied by browser-use.
"""
import os
import time


def wait_until(expression, message):
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        if js(expression):
            return
        time.sleep(0.02)
    raise AssertionError(message)


def click_button(name):
    nodes = cdp("Accessibility.getFullAXTree")["nodes"]
    node = next(n for n in nodes if n.get("role", {}).get("value") == "button"
                and n.get("name", {}).get("value") == name)
    cdp("DOM.scrollIntoViewIfNeeded", backendNodeId=node["backendDOMNodeId"])
    box = cdp("DOM.getBoxModel", backendNodeId=node["backendDOMNodeId"])["model"]["content"]
    click_at_xy(sum(box[0::2]) / 4, sum(box[1::2]) / 4)


def start_delete():
    wait_until("document.body.innerText.includes('本地 Skills 管理')", "fixture did not load")
    click_button("删除 codex 中的 demo")
    wait_until("document.body.innerText.includes('删除本地 Skill？')", "confirmation did not open")
    click_button("删除")
    wait_until("window.localDeleteHarness.deleteStarted", "delete IPC did not start")


base = os.environ.get("LOCAL_SKILL_TEST_URL", "http://127.0.0.1:1420")
new_tab(base + "/tests/browser/local-skill-delete.html")
cdp("Emulation.setFocusEmulationEnabled", enabled=True)
try:
    start_delete()
    assert js("document.body.innerText.includes('删除本地 Skill？')"), "closed before deletion succeeded"
    js("window.localDeleteHarness.deletion.resolve()")
    wait_until("window.localDeleteHarness.refreshStarted", "refresh did not start")
    wait_until("!document.body.innerText.includes('删除本地 Skill？')",
               "dialog is still open while the post-delete scan is pending")
    assert not js("window.localDeleteHarness.refreshDone"), "refresh gate was bypassed"
    js("window.localDeleteHarness.refresh.reject(new Error('simulated refresh failure'))")
    wait_until("document.body.innerText.includes('删除已完成，但刷新失败')", "refresh error was not shown")
    assert not js("document.body.innerText.includes('删除本地 Skill？')"), "refresh error reopened confirmation"

    cdp("Page.reload", ignoreCache=True)
    wait_until("window.localDeleteHarness && !window.localDeleteHarness.deleteStarted", "fixture did not reset")
    start_delete()
    js("window.localDeleteHarness.deletion.reject(new Error('simulated deletion failure'))")
    wait_until("document.body.innerText.includes('simulated deletion failure')", "delete error was not shown")
    assert js("document.body.innerText.includes('删除本地 Skill？')"), "delete failure closed confirmation"
    wait_until("!document.body.innerText.includes('加载中')", "failed delete left confirmation busy")
    assert not js("window.localDeleteHarness.refreshStarted"), "failed deletion started a refresh"
    assert not js("window.localDeleteHarness.errors"), "browser reported unexpected errors"
    print("PASS: close before scan completes; refresh failure stays closed; delete failure remains retryable")
finally:
    js("window.localDeleteHarness.deletion.resolve();window.localDeleteHarness.refresh.resolve()")
    cdp("Emulation.setFocusEmulationEnabled", enabled=False)
    close_tab()
