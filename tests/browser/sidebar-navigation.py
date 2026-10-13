"""Run with browser-use < tests/browser/sidebar-navigation.py and Vite running.
Real sidebar, dashboard, workspace and library; fixture IPC never accesses files.
"""
import os
import time


def wait_until(expression):
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        if js(expression):
            return
        time.sleep(0.02)
    raise AssertionError(expression)


def focus_button(name):
    node = next(n for n in cdp("Accessibility.getFullAXTree")["nodes"]
                if n.get("role", {}).get("value") == "button"
                and n.get("name", {}).get("value", "").startswith(name))
    cdp("DOM.focus", backendNodeId=node["backendDOMNodeId"])


def key(name, code):
    values = {"key": name, "code": name, "windowsVirtualKeyCode": code}
    if name == "Enter":
        values.update(text="\r", unmodifiedText="\r")
    cdp("Input.dispatchKeyEvent", type="keyDown", **values)
    cdp("Input.dispatchKeyEvent", type="keyUp", **values)


base = os.environ.get("LOCAL_SKILL_TEST_URL", "http://127.0.0.1:1420")
url = base + "/tests/browser/product-preview.html"
new_tab(url + "?view=dashboard&theme=light&language=en&text-size=xlarge&undeployed&ungrouped")
target = current_tab()["targetId"]
cdp("Emulation.setFocusEmulationEnabled", enabled=True)
try:
    cdp("Emulation.setDeviceMetricsOverride", width=960, height=900, deviceScaleFactor=1, mobile=False)
    wait_until("document.querySelector('#dashboard-library-count')?.textContent==='12'")
    focus_button("Global Workspace")
    key("Enter", 13)
    wait_until("document.querySelector('[data-rfd-draggable-id=hermes]')!==null")
    assert js("document.querySelector('#preview-route').textContent==='/'"), "header navigated"
    assert js("[...document.querySelectorAll('[data-rfd-draggable-id]')].map(n=>n.getAttribute('data-rfd-draggable-id')).join(',')==='claude_code,codex,cursor,opencode,hermes'"), "assistants did not append"
    key("Tab", 9)
    assert js("document.activeElement?.getAttribute('href')==='/global-workspace'"), "overview not keyboard reachable"
    key("Enter", 13)
    wait_until("document.querySelector('#preview-route').textContent==='/global-workspace'")
    assert js("[...document.querySelectorAll('.app-page button.app-panel')].some(b=>b.textContent.includes('Hermes Agent'))"), "global overview omitted assistant"
    focus_button("Library")
    key("Enter", 13)
    wait_until("document.querySelector('a[href=\"/my-skills\"]')!==null")
    assert js("document.querySelector('#preview-route').textContent==='/global-workspace'"), "library title navigated"
    key("Tab", 9)
    assert js("document.activeElement?.textContent==='All Skills'"), "All Skills not keyboard reachable"
    key("Enter", 13)
    wait_until("document.querySelector('a[href=\"/my-skills\"]')?.getAttribute('aria-current')==='page'")
    assert js("document.documentElement.scrollWidth<=innerWidth"), "horizontal overflow"
    assert js("getComputedStyle(document.documentElement).getPropertyValue('--app-scale').trim()==='1.2'"), "text scaling not applied"
    print("PASS: native Enter toggles, Tab/Enter overview and All Skills; 960px English light theme at 120%")

    cdp("Emulation.setDeviceMetricsOverride", width=800, height=900, deviceScaleFactor=1, mobile=False)
    goto_url(url + "?theme=dark&language=zh-TW&text-size=xlarge&undeployed&ungrouped")
    wait_for_load()
    wait_until("document.querySelector('#preview-route')?.textContent==='/my-skills'")
    assert js("document.documentElement.scrollWidth<=innerWidth"), "horizontal overflow"
    assert js("document.querySelector('a[aria-current=page]').textContent==='全部技能'")
    print("PASS: 800px Traditional Chinese dark theme at 120%")

    cdp("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=1, mobile=False)
    goto_url(url + "?view=dashboard&theme=dark&language=zh&undeployed&ungrouped")
    wait_for_load()
    wait_until("document.querySelector('#dashboard-library-count')?.textContent==='12'")
    for card, query, count in [("待部署", "deployment=undeployed", 7), ("待分组", "grouping=ungrouped", 4)]:
        focus_button(card)
        key("Enter", 13)
        wait_until(f"document.querySelector('#preview-route').textContent==='/my-skills?{query}'")
        wait_until(f"document.querySelector('[role=status]')?.textContent==='显示 {count} 个技能'")
        assert js("document.querySelector('a[aria-current=page]').textContent==='全部技能'"), "dashboard did not select All Skills"
        focus_button("清除筛选")
        key("Enter", 13)
        wait_until("document.querySelector('[role=status]')?.textContent==='显示 12 个技能'")
        # The existing Dashboard link is in the sidebar; navigate by a native click.
        node = next(n for n in cdp("Accessibility.getFullAXTree")["nodes"]
                    if n.get("role", {}).get("value") == "link"
                    and n.get("name", {}).get("value") == "工作台")
        box = cdp("DOM.getBoxModel", backendNodeId=node["backendDOMNodeId"])["model"]["content"]
        click_at_xy(sum(box[0::2]) / 4, sum(box[1::2]) / 4)
        wait_until("document.querySelector('#preview-route').textContent==='/'")
        assert js("document.querySelector('[class~=\"w-[220px]\"]').querySelectorAll('[aria-expanded=true]').length===0"), "inactive regions stayed open"
    print("PASS: dashboard automatic undeployed/ungrouped filters, All Skills selection, clear filters and automatic collapse")
finally:
    cdp("Emulation.clearDeviceMetricsOverride")
    cdp("Emulation.setFocusEmulationEnabled", enabled=False)
    cdp("Target.closeTarget", targetId=target)
