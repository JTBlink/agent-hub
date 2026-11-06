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


def drag_up():
    focus("数据4")
    focus("调整 数据 的排序")
    for name, code in [(" ", 32), ("ArrowUp", 38), (" ", 32)]:
        key(name, code)
        time.sleep(0.1)


url = "http://127.0.0.1:1420/tests/browser/product-preview.html?many-groups"
new_tab(url + "&language=zh&theme=dark")
target = current_tab()["targetId"]
try:
    cdp("Emulation.setFocusEmulationEnabled", enabled=True)
    for language, theme, width in [
        ("zh", "dark", 1440),
        ("en", "light", 960),
        ("zh-TW", "dark", 800),
    ]:
        cdp("Emulation.setDeviceMetricsOverride", width=width, height=900,
            deviceScaleFactor=1, mobile=False)
        goto_url(url + f"&language={language}&theme={theme}&text-size=xlarge")
        wait_for_load()
        wait_until("document.querySelectorAll('[data-rfd-droppable-id=skillGroups] [data-rfd-draggable-id]').length===13")
        assert js("document.documentElement.scrollWidth<=innerWidth"), "horizontal overflow"
        assert js("getComputedStyle(document.documentElement).getPropertyValue('--app-scale').trim()==='1.2'")
        print(f"PASS: all groups visible, {language}/{theme}/{width}px at 120%")

    goto_url(url + "&language=zh&theme=dark")
    wait_for_load()
    wait_until("document.querySelectorAll('[data-rfd-droppable-id=skillGroups] [data-rfd-draggable-id]').length===13")
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
    expected = [f"group-{i}" for i in [0, 1, 2, 3, 5, 4, 6, 7, 8, 9, 10, 11, 12]]
    for attempt, reject in [(1, False), (2, True)]:
        js(f"window.__sidebarRejectReorder={str(reject).lower()}")
        drag_up()
        wait_until(f"window.__sidebarReorders.length==={attempt}")
        wait_until("document.querySelector('[data-rfd-drag-handle-draggable-id]')?.getAttribute('aria-disabled')!=='true'")
        assert rows() == expected, "failed save changed order" if reject else "incorrect group order"
        if not reject:
            assert js("window.__sidebarReorders[0]") == expected, "hidden groups dropped from saved order"
        print("PASS: failed save restores order" if reject else "PASS: keyboard drag saves all 13 IDs")
finally:
    cdp("Emulation.clearDeviceMetricsOverride")
    cdp("Emulation.setFocusEmulationEnabled", enabled=False)
    cdp("Target.closeTarget", targetId=target)
