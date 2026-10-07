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
    wait_until("Array.from(document.querySelectorAll('a')).some(a=>a.textContent.replace(/\\s/g,'')==='已启用Agent1')",
               "enabled Agent card must be a link and only count installed, enabled Agents")


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
                and "已启用 AGENT" in n.get("name", {}).get("value", ""))
    cdp("DOM.scrollIntoViewIfNeeded", backendNodeId=node["backendDOMNodeId"])
    box = cdp("DOM.getBoxModel", backendNodeId=node["backendDOMNodeId"])["model"]["content"]
    click_at_xy(sum(box[0::2]) / 4, sum(box[1::2]) / 4)
    landed()
    cdp("Page.reload", ignoreCache=True)
    ready()
    cdp("Input.dispatchKeyEvent", type="keyDown", key="Tab", code="Tab", windowsVirtualKeyCode=9)
    cdp("Input.dispatchKeyEvent", type="keyUp", key="Tab", code="Tab", windowsVirtualKeyCode=9)
    wait_until("document.activeElement?.getAttribute('href')==='/settings#agents'", "Agent link is not keyboard accessible")
    cdp("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter", windowsVirtualKeyCode=13)
    cdp("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter", windowsVirtualKeyCode=13)
    landed()
    print("PASS: enabled count; click navigation; keyboard navigation; focused Agent settings")
finally:
    cdp("Emulation.setFocusEmulationEnabled", enabled=False)
    close_tab()
