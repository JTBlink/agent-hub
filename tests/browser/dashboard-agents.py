"""Run with browser-use < tests/browser/dashboard-agents.py and Vite running.
Real Dashboard, providers, route and Settings; fixture IPC never accesses files.
"""
import os
import time


def wait_until(expression, message):
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        if js(expression):
            return
        time.sleep(0.02)
    raise AssertionError(message)


def ready():
    wait_until("Boolean(document.querySelector('.dashboard-workspaces a[href=\"/global-workspace/codex\"]')) && Boolean(document.querySelector('.dashboard-workspaces a[href=\"/settings#agents\"]'))",
               "Agent panel must retain its enabled Agent and management links")


def landed():
    wait_until("document.querySelector('#route-marker').textContent==='/settings#agents'", "did not reach Agent settings")
    wait_until("document.activeElement?.id==='agents'", "Agent section did not receive keyboard focus")
    assert js("document.getElementById('agents').getBoundingClientRect().top >= 0"), "Agent section was not visible"
    assert not js("window.dashboardAgentHarness.errors"), "unexpected browser errors"


base = os.environ.get("LOCAL_SKILL_TEST_URL", "http://127.0.0.1:1420")
new_tab(base + "/tests/browser/dashboard-agents.html")
cdp("Emulation.setFocusEmulationEnabled", enabled=True)
try:
    ready()
    nodes = cdp("Accessibility.getFullAXTree")["nodes"]
    node = next(n for n in nodes if n.get("role", {}).get("value") == "link"
                and n.get("name", {}).get("value", "") == "管理")
    cdp("DOM.scrollIntoViewIfNeeded", backendNodeId=node["backendDOMNodeId"])
    box = cdp("DOM.getBoxModel", backendNodeId=node["backendDOMNodeId"])["model"]["content"]
    click_at_xy(sum(box[0::2]) / 4, sum(box[1::2]) / 4)
    landed()
    cdp("Page.reload", ignoreCache=True)
    ready()
    for _ in range(20):
        cdp("Input.dispatchKeyEvent", type="keyDown", key="Tab", code="Tab", windowsVirtualKeyCode=9)
        cdp("Input.dispatchKeyEvent", type="keyUp", key="Tab", code="Tab", windowsVirtualKeyCode=9)
        if js("document.activeElement?.getAttribute('href')==='/settings#agents'"):
            break
    wait_until("document.activeElement?.getAttribute('href')==='/settings#agents'", "Agent link is not keyboard accessible")
    cdp("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter", windowsVirtualKeyCode=13)
    cdp("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter", windowsVirtualKeyCode=13)
    landed()
    print("PASS: Agent panel; click navigation; keyboard navigation; focused Agent settings")
finally:
    cdp("Emulation.setFocusEmulationEnabled", enabled=False)
    close_tab()
