"""Run with browser-use < tests/browser/sidebar-skill-groups.py and Vite running.
Exercises real sidebar rows and native keyboard drag with synthetic IPC only.
"""
import time


def wait_until(expression):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if js(expression):
            return
        time.sleep(0.03)
    raise AssertionError(expression)


def focus(name):
    node = next(n for n in cdp("Accessibility.getFullAXTree")["nodes"]
                if n.get("role", {}).get("value") == "button"
                and "".join(n.get("name", {}).get("value", "").split()) == "".join(name.split()))
    cdp("DOM.focus", backendNodeId=node["backendDOMNodeId"])


def key(name, code):
    values = {"key": name, "code": "Space" if name == " " else name,
              "windowsVirtualKeyCode": code}
    if name in ("Enter", " "):
        values.update(text="\r" if name == "Enter" else " ",
                      unmodifiedText="\r" if name == "Enter" else " ")
    cdp("Input.dispatchKeyEvent", type="keyDown", **values)
    cdp("Input.dispatchKeyEvent", type="keyUp", **values)


def rows():
    return js("[...document.querySelectorAll('[data-rfd-droppable-id=skillGroups] [data-rfd-draggable-id]')].map(n=>n.getAttribute('data-rfd-draggable-id'))")


url = "http://127.0.0.1:1420/tests/browser/product-preview.html?many-groups"
new_tab(url + "&language=zh&theme=dark")
target = current_tab()["targetId"]
try:
    cdp("Emulation.setFocusEmulationEnabled", enabled=True)
    for language, theme, width, more, less in [
        ("zh", "dark", 1440, "更多...13", "收起13"),
        ("en", "light", 960, "More...13", "Show less13"),
        ("zh-TW", "dark", 800, "更多...13", "收合13"),
    ]:
        cdp("Emulation.setDeviceMetricsOverride", width=width, height=900,
            deviceScaleFactor=1, mobile=False)
        goto_url(url + f"&language={language}&theme={theme}&text-size=xlarge")
        wait_for_load()
        wait_until("document.querySelectorAll('[data-rfd-droppable-id=skillGroups] [data-rfd-draggable-id]').length===5")
        focus(more)
        key("Enter", 13)
        wait_until("document.querySelectorAll('[data-rfd-droppable-id=skillGroups] [data-rfd-draggable-id]').length===13")
        assert not js("document.querySelector('dialog,[role=dialog]')!==null"), "unexpected dialog"
        assert js("document.activeElement?.getAttribute('aria-expanded')==='true'"), "focus moved"
        focus(less)
        key(" ", 32)
        wait_until("document.querySelectorAll('[data-rfd-droppable-id=skillGroups] [data-rfd-draggable-id]').length===5")
        assert js("document.activeElement?.getAttribute('aria-expanded')==='false'"), "collapse lost focus"
        assert js("document.documentElement.scrollWidth<=innerWidth"), "horizontal overflow"
        assert js("getComputedStyle(document.documentElement).getPropertyValue('--app-scale').trim()==='1.2'")
        print(f"PASS: inline expansion/collapse, native Enter/Space, focus, {language}/{theme}/{width}px at 120%")

    goto_url(url + "&language=zh&theme=dark")
    wait_for_load()
    wait_until("document.querySelectorAll('[data-rfd-droppable-id=skillGroups] [data-rfd-draggable-id]').length===5")
    js("""(() => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__sidebarReorders = [];
      window.__sidebarRejectReorder = false;
      window.__TAURI_INTERNALS__.invoke = async (command, args) => {
        if (command === 'reorder_skill_groups') {
          window.__sidebarReorders.push(args.ids);
          if (window.__sidebarRejectReorder) throw new Error('Fixture save failure');
        }
        return invoke(command, args);
      };
    })()""")
    focus("更多...13")
    key("Enter", 13)
    wait_until("document.querySelectorAll('[data-rfd-droppable-id=skillGroups] [data-rfd-draggable-id]').length===13")
    # Focus the row first to reveal its keyboard drag handle.
    focus("数据4")
    focus("调整 数据 的排序")
    key(" ", 32)
    time.sleep(0.1)
    key("ArrowUp", 38)
    time.sleep(0.1)
    key(" ", 32)
    wait_until("window.__sidebarReorders.length===1")
    wait_until("document.querySelector('button[aria-controls]')?.disabled===false")
    expected = [f"group-{i}" for i in [0, 1, 2, 3, 5, 4, 6, 7, 8, 9, 10, 11, 12]]
    assert rows() == expected, rows()
    assert js("window.__sidebarReorders[0]") == expected, "hidden groups dropped from saved order"
    focus("收起13")
    key("Enter", 13)
    wait_until("document.querySelectorAll('[data-rfd-droppable-id=skillGroups] [data-rfd-draggable-id]').length===5")
    assert rows() == expected[:5]
    print("PASS: expanded keyboard drag saves all 13 IDs and updates five common groups")

    js("window.__sidebarRejectReorder=true")
    focus("数据4")
    focus("调整 数据 的排序")
    key(" ", 32)
    time.sleep(0.1)
    key("ArrowUp", 38)
    time.sleep(0.1)
    key(" ", 32)
    wait_until("window.__sidebarReorders.length===2")
    wait_until("document.querySelector('button[aria-controls]')?.disabled===false")
    assert rows() == expected[:5], "failed save changed common order"
    print("PASS: failed reorder restores common order")
finally:
    cdp("Target.closeTarget", targetId=target)
