"""Run with browser-use < tests/browser/local-skill-cleanup.py and Vite running."""
import os
import time


def wait_until(expression, message):
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        if js(expression):
            return
        time.sleep(0.02)
    raise AssertionError(message)


def click_button(name):
    node = next(n for n in cdp("Accessibility.getFullAXTree")["nodes"]
                if n.get("role", {}).get("value") == "button" and n.get("name", {}).get("value") == name)
    cdp("DOM.scrollIntoViewIfNeeded", backendNodeId=node["backendDOMNodeId"])
    box = cdp("DOM.getBoxModel", backendNodeId=node["backendDOMNodeId"])["model"]["content"]
    click_at_xy(sum(box[0::2])/4, sum(box[1::2])/4)


def preview():
    wait_until("document.body.innerText.includes('一键清理')", "cleanup entry absent")
    click_button("一键清理")
    wait_until("document.body.innerText.includes('清理未安装 Agent 的遗留 Skills？')", "preview absent")


base = os.environ.get("LOCAL_SKILL_TEST_URL", "http://127.0.0.1:1420")
new_tab(base + "/tests/browser/local-skill-cleanup.html")
cdp("Emulation.setFocusEmulationEnabled", enabled=True)
try:
    preview()
    assert js("document.body.innerText.includes('<workspace>/grok/skills/one') && document.body.innerText.includes('<workspace>/qwen/skills')"), "preview lacks paths"
    click_button("取消")
    assert js("window.localCleanupHarness.selected.length===0"), "cancel submitted deletion"
    preview()
    # Dispatch a native select change in this isolated React fixture; the
    # Chrome OS picker is not available to background focus emulation.
    js("const select=document.querySelector('select');select.value='qwen_code';select.dispatchEvent(new Event('change',{bubbles:true}))")
    wait_until("document.querySelector('select').value==='qwen_code'", "Agent filter did not select qwen")
    assert not js("document.body.innerText.includes('<workspace>/grok/skills/one')"), "other Agent remained selected"
    click_button("确认清理")
    wait_until("JSON.stringify(window.localCleanupHarness.selected)==='[\"qwen-empty\"]'", "cleanup sent other Agents' paths")
    js("window.localCleanupHarness.cleanup.resolve({removed:1,failures:[]})")
    wait_until("window.localCleanupHarness.refreshStarted", "refresh not started")
    wait_until("!document.body.innerText.includes('清理未安装 Agent 的遗留 Skills？')", "cleanup modal waited for scan")
    js("window.localCleanupHarness.refresh.resolve();window.localCleanupHarness.empty=true")
    click_button("一键清理")
    wait_until("document.body.innerText.includes('没有可清理')", "empty cleanup result not explained")
    assert not js("window.localCleanupHarness.errors"), "unexpected browser errors"
    print("PASS: preview paths; cancel; Agent filter; selected IDs only; close before refresh; no leftovers")
finally:
    js("window.localCleanupHarness.cleanup.resolve({removed:0,failures:[]});window.localCleanupHarness.refresh.resolve()")
    cdp("Emulation.setFocusEmulationEnabled", enabled=False)
    close_tab()
