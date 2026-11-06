"""Run from the repository root: browser-use < tests/browser/sidebar-navigation.py.
Vite must be running; all IPC comes from the synthetic product-preview fixture.
Component tests cover resource-panel state and dashboard filters; this checks
native Enter/Tab navigation and real layout across themes and text scaling.
"""
import os
import time


def wait_until(expression):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if js(expression):
            return
        time.sleep(0.03)
    raise AssertionError(expression)


def key(name, code):
    event = {"key": name, "code": name, "windowsVirtualKeyCode": code}
    if name == "Enter":
        event.update(text="\r", unmodifiedText="\r")
    cdp("Input.dispatchKeyEvent", type="keyDown", **event)
    cdp("Input.dispatchKeyEvent", type="keyUp", **event)


base = os.environ.get("LOCAL_SKILL_TEST_URL", "http://127.0.0.1:1420")
url = base + "/tests/browser/product-preview.html?view=dashboard&text-size=xlarge"
new_tab(url)
target = current_tab()["targetId"]
try:
    cdp("Emulation.setFocusEmulationEnabled", enabled=True)
    for language, theme, width in [("zh", "dark", 1440), ("en", "light", 960), ("zh-TW", "dark", 800)]:
        cdp("Emulation.setDeviceMetricsOverride", width=width, height=900,
            deviceScaleFactor=1, mobile=False)
        goto_url(url + f"&language={language}&theme={theme}")
        wait_until("document.querySelector('.workbench-activity-bar a[href=\"/tasks\"]')!==null")
        assert js("document.documentElement.scrollWidth<=innerWidth"), "horizontal overflow"
        assert js("[...document.querySelectorAll('.workbench-activity-bar button,.workbench-activity-bar a')].every(n=>n.getAttribute('aria-label'))"), "unlabelled navigation"
        js("document.querySelector('.workbench-activity-bar a[href=\"/tasks\"]').focus()")
        key("Enter", 13)
        wait_until("document.querySelector('#preview-route').textContent==='/tasks'")
        key("Tab", 9)
        assert js("document.activeElement.getAttribute('href')==='/automation'"), "Tab skipped automation"
        key("Enter", 13)
        wait_until("document.querySelector('#preview-route').textContent==='/automation'")
        assert js("document.querySelectorAll('.workbench-activity-bar [aria-current=page]').length===1"), "ambiguous active navigation"
        print(f"PASS: Enter/Tab navigation and layout, {language}/{theme}/{width}px at 120%")
finally:
    cdp("Emulation.clearDeviceMetricsOverride")
    cdp("Emulation.setFocusEmulationEnabled", enabled=False)
    cdp("Target.closeTarget", targetId=target)
