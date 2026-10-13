"""Run with browser-use < tests/browser/dashboard-layout.py and Vite running.
Checks the real dashboard with synthetic data, including page-only scrolling.
"""
import os
import time


def wait_until(expression, message):
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        if js(expression):
            return
        time.sleep(0.03)
    raise AssertionError(message)


def ready():
    wait_until("Boolean(document.querySelector('#dashboard-library-count')) && document.querySelector('#dashboard-library-count').textContent !== '—'",
               "dashboard did not finish loading")


def click_named_button(name):
    nodes = cdp("Accessibility.getFullAXTree")["nodes"]
    node = next(n for n in nodes if n.get("role", {}).get("value") == "button"
                and n.get("name", {}).get("value", "").startswith(name))
    cdp("DOM.scrollIntoViewIfNeeded", backendNodeId=node["backendDOMNodeId"])
    box = cdp("DOM.getBoxModel", backendNodeId=node["backendDOMNodeId"])["model"]["content"]
    click_at_xy(sum(box[0::2]) / 4, sum(box[1::2]) / 4)


base = os.environ.get("LOCAL_SKILL_TEST_URL", "http://127.0.0.1:1420")
url = base + "/tests/browser/product-preview.html?view=dashboard"
new_tab(url + "&undeployed&ungrouped&many-projects")
cdp("Emulation.setFocusEmulationEnabled", enabled=True)
try:
    for width, theme, language, size, flags in [
        (1440, "dark", "zh", "default", "&undeployed&ungrouped"),
        (1440, "light", "en", "default", "&undeployed&ungrouped"),
        (960, "light", "en", "xlarge", "&undeployed&ungrouped"),
        (800, "dark", "zh-TW", "xlarge", "&undeployed&ungrouped"),
        (960, "light", "zh", "default", "&empty"),
    ]:
        cdp("Emulation.setDeviceMetricsOverride", width=width, height=800 if width == 1440 and language == "zh" else 1000,
            deviceScaleFactor=1, mobile=False)
        goto_url(url + f"&theme={theme}&language={language}&text-size={size}" + flags)
        wait_for_load()
        ready()
        assert js("document.documentElement.scrollWidth <= innerWidth"), "horizontal overflow"
        assert js("[...document.querySelectorAll('.dashboard-overview [id^=dashboard-][id$=-title]')].every(el=>el.closest('button').getBoundingClientRect().right <= innerWidth)"), "overview card clipped"
        assert js("document.querySelector('.dashboard-library-art')?.getAttribute('aria-hidden') === 'true'"), "decorative SVG not hidden"
        assert js("[...document.querySelectorAll('.dashboard-workspace-grid,.dashboard-recent-grid')].every(e=>e.scrollHeight <= e.clientHeight + 1)"), "nested scroll region"
        if width == 1440 and language == "zh":
            assert js("document.querySelector('.dashboard-page').parentElement.parentElement.scrollHeight <= document.querySelector('.dashboard-page').parentElement.parentElement.clientHeight + 1"), "default dashboard does not fit the first screen"
            assert js("document.querySelectorAll('#dashboard-recent-skills button').length === 3"), "recent skills not compact by default"
            click_named_button("展开另外")
            wait_until("document.querySelectorAll('#dashboard-recent-skills button').length === 5", "recent expansion did not show all skills")
            click_named_button("收起近期技能")
            wait_until("document.querySelectorAll('#dashboard-recent-skills button').length === 3", "recent collapse did not restore compact view")
            assert js("document.activeElement?.getAttribute('aria-controls') === 'dashboard-recent-skills'"), "collapse lost keyboard focus"
        print("PASS:", width, theme, language, size)

    cdp("Emulation.setDeviceMetricsOverride", width=1440, height=700,
        deviceScaleFactor=1, mobile=False)
    goto_url(url + "&theme=dark&language=zh&undeployed&ungrouped&many-projects")
    wait_for_load()
    ready()
    assert js("document.querySelectorAll('.dashboard-workspace-switch button')[0].getAttribute('aria-pressed') === 'true'"), "projects are not the default"
    wait_until("document.querySelectorAll('#dashboard-workspace-entries a').length === 12",
               "project grid did not show all projects")
    assert js("document.querySelector('#dashboard-workspace-entries').scrollHeight === document.querySelector('#dashboard-workspace-entries').clientHeight"), "project grid scrolls independently"
    node = next(n for n in cdp("Accessibility.getFullAXTree")["nodes"]
                if n.get("role", {}).get("value") == "searchbox"
                and n.get("name", {}).get("value") == "搜索工作空间")
    box = cdp("DOM.getBoxModel", backendNodeId=node["backendDOMNodeId"])["model"]["content"]
    click_at_xy(sum(box[0::2]) / 4, sum(box[1::2]) / 4)
    cdp("Input.insertText", text="DEMO-PROJECT-11")
    wait_until("document.querySelectorAll('#dashboard-workspace-entries a').length === 1", "project search did not filter")
    click_named_button("清除工作空间搜索")
    wait_until("document.querySelectorAll('#dashboard-workspace-entries a').length === 12", "clear did not restore projects")
    before = js("[...document.querySelectorAll('.dashboard-page')][0].parentElement.parentElement.scrollTop")
    cdp("Input.dispatchMouseEvent", type="mouseWheel", x=450, y=520,
        deltaX=0, deltaY=500)
    wait_until(f"document.querySelector('.dashboard-page').parentElement.parentElement.scrollTop > {before}",
               "wheel over projects did not scroll the main page")
    assert js("document.querySelector('#dashboard-workspace-entries').scrollTop === 0"), "project grid consumed scrolling"
    print("PASS: project switch, complete 12-project grid, page-only wheel scrolling")

    goto_url(url + "&theme=dark&language=zh&undeployed&ungrouped")
    wait_for_load()
    ready()
    for _ in range(60):
        cdp("Input.dispatchKeyEvent", type="keyDown", key="Tab", code="Tab", windowsVirtualKeyCode=9)
        cdp("Input.dispatchKeyEvent", type="keyUp", key="Tab", code="Tab", windowsVirtualKeyCode=9)
        if js("document.activeElement?.getAttribute('aria-labelledby') === 'dashboard-undeployed-title'"):
            break
    assert js("document.activeElement?.getAttribute('aria-labelledby') === 'dashboard-undeployed-title'"), "card not keyboard reachable"
    assert js("getComputedStyle(document.activeElement).outlineStyle !== 'none'"), "missing keyboard focus"
    cdp("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter", windowsVirtualKeyCode=13, text="\r", unmodifiedText="\r")
    cdp("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter", windowsVirtualKeyCode=13)
    wait_until("document.querySelector('[role=status]')?.textContent === '显示 7 个技能'",
               "keyboard card navigation did not show the whole undeployed library")
    print("PASS: Tab focus and Enter navigation")
finally:
    cdp("Emulation.clearDeviceMetricsOverride")
    cdp("Emulation.setFocusEmulationEnabled", enabled=False)
    close_tab()
