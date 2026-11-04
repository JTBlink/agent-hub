(() => {
  // Same-origin child documents are handled by the owning top-level inspector.
  try {
    if (window !== top && top.__agentHubNativePreview) return;
  } catch {
    return;
  }
  const state = {
    picking: false,
    captured: null,
    cancelled: false,
    navigation: 0,
    events: [],
    eventBytes: 0,
  };
  const pick = __PICK_FUNCTION__;
  const context = __ELEMENT_CONTEXT__;
  const record = (method, params) => {
    const entry = { method, params };
    state.events.push(entry);
    state.eventBytes += JSON.stringify(entry).length;
    while (state.events.length > 150 || state.eventBytes > 256000) {
      const dropped = state.events.shift();
      state.eventBytes -= JSON.stringify(dropped).length;
    }
  };
  const printable = (value) => {
    try {
      return (
        typeof value === "string"
          ? value
          : (JSON.stringify(value) ?? String(value))
      ).slice(0, 500);
    } catch {
      return "[Unserializable value]";
    }
  };
  const monitored = new WeakMap();
  const monitor = (win) => {
    if (!win || monitored.get(win) === win.document) return;
    monitored.set(win, win.document);
    if (win !== window) {
      for (const name of ["pushState", "replaceState"]) {
        const original = win.history[name];
        win.history[name] = function (...args) {
          const result = original.apply(this, args);
          navigation();
          return result;
        };
      }
      win.addEventListener("popstate", navigation);
      win.addEventListener("hashchange", navigation);
    }
    for (const level of ["log", "info", "warn", "error", "debug"]) {
      const original = win.console[level];
      win.console[level] = function (...args) {
        record("Runtime.consoleAPICalled", {
          type: level,
          args: args.slice(0, 5).map((value) => ({ value: printable(value) })),
          timestamp: Date.now(),
          url: win.location.href.slice(0, 2048),
        });
        return original.apply(this, args);
      };
    }
    win.addEventListener("error", (event) =>
      record("Runtime.exceptionThrown", {
        exceptionDetails: {
          text: String(event.message || "Page error").slice(0, 2000),
          url: String(event.filename || "").slice(0, 2048),
          lineNumber: event.lineno,
        },
      }),
    );
    win.addEventListener("unhandledrejection", (event) =>
      record("Runtime.exceptionThrown", {
        exceptionDetails: { text: printable(event.reason) },
      }),
    );
    try {
      new win.PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          record("Network.requestFinished", {
            url: entry.name.slice(0, 2048),
            initiatorType: entry.initiatorType,
            duration: entry.duration,
            transferSize: entry.transferSize,
          });
      }).observe({ type: "resource", buffered: true });
    } catch {}
  };
  monitor(window);
  let marker, hovered;
  const hide = () => {
    marker?.remove();
    marker = undefined;
    hovered = undefined;
  };
  const navigation = () => {
    state.navigation++;
    state.captured = null;
    state.picking = false;
    state.cancelled = true;
    window.__agentHubSnapshots?.clear();
    hide();
  };
  for (const name of ["pushState", "replaceState"]) {
    const original = history[name];
    history[name] = function (...args) {
      const result = original.apply(this, args);
      navigation();
      return result;
    };
  }
  addEventListener("popstate", navigation);
  addEventListener("hashchange", navigation);
  const topPoint = (event) => {
    let x = event.clientX,
      y = event.clientY,
      win = event.view || event.target?.ownerDocument?.defaultView || window;
    for (let depth = 0; win !== window && depth < 16; depth++) {
      let frame;
      try {
        frame = win.frameElement;
      } catch {
        return null;
      }
      if (!frame) return null;
      const box = frame.getBoundingClientRect(),
        sx = frame.offsetWidth ? box.width / frame.offsetWidth : 1,
        sy = frame.offsetHeight ? box.height / frame.offsetHeight : 1;
      x = box.x + (x + frame.clientLeft) * sx;
      y = box.y + (y + frame.clientTop) * sy;
      win = frame.ownerDocument.defaultView;
    }
    return { x, y };
  };
  const capture = (point, operation = "capture") => {
    const scale = window.visualViewport?.scale || 1,
      ox = window.visualViewport?.offsetLeft || 0,
      oy = window.visualViewport?.offsetTop || 0;
    hide();
    const value = pick((point.x - ox) * scale, (point.y - oy) * scale);
    if (value)
      state.captured = {
        id: crypto.randomUUID(),
        value,
        operation,
        revision:
          String(performance.timeOrigin) +
          ":" +
          state.navigation +
          ":" +
          location.href,
        url: location.href,
      };
    state.picking = false;
  };
  const attached = new WeakSet();
  const attach = (doc, depth = 0) => {
    if (!doc || attached.has(doc) || depth > 16) return;
    attached.add(doc);
    monitor(doc.defaultView);
    const captureOptions = { capture: true, passive: false };
    for (const type of [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "touchstart",
      "touchend",
      "wheel",
      "keydown",
    ])
      doc.addEventListener(
        type,
        (event) => {
          if (
            state.captureBusy ||
            (state.picking &&
              !["wheel", "keydown", "touchstart", "touchend"].includes(type))
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        },
        captureOptions,
      );
    doc.addEventListener(
      "mousemove",
      (event) => {
        if (!state.picking) return;
        const point = topPoint(event);
        if (!point) return;
        const node = context.hit(point.x, point.y);
        if (!node) return;
        hovered = point;
        const box = context.bounds(node);
        if (!marker) {
          marker = document.createElement("div");
          marker.setAttribute("data-agent-hub-inspector", "");
          marker.style.cssText =
            "position:fixed;pointer-events:none;z-index:2147483647;border:2px solid Highlight;background:color-mix(in srgb,Highlight 12%,transparent);box-sizing:border-box";
          document.documentElement.append(marker);
        }
        Object.assign(marker.style, {
          left: box.x + "px",
          top: box.y + "px",
          width: box.width + "px",
          height: box.height + "px",
        });
      },
      true,
    );
    doc.addEventListener(
      "click",
      (event) => {
        if (!state.picking) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const point = topPoint(event);
        if (point) capture(point);
      },
      true,
    );
    doc.addEventListener(
      "keydown",
      (event) => {
        if (!state.picking) return;
        if (event.key === "Escape") {
          state.enable(false);
          state.cancelled = true;
          event.preventDefault();
          event.stopImmediatePropagation();
        } else if (
          hovered &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          ["c", "s"].includes(event.key.toLowerCase())
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          capture(
            hovered,
            event.key.toLowerCase() === "c" ? "copy" : "capture",
          );
        }
      },
      true,
    );
    doc.addEventListener(
      "load",
      (event) => {
        if (["iframe", "frame"].includes(event.target?.localName))
          try {
            attach(event.target.contentDocument, depth + 1);
            scan(event.target.contentDocument, depth + 1);
          } catch {}
      },
      true,
    );
  };
  const scan = (root = document, depth = 0) => {
    if (depth > 16) return;
    const walker =
      root.ownerDocument?.createTreeWalker(root, 1) ||
      document.createTreeWalker(root, 1);
    let node,
      count = 0;
    while ((node = walker.nextNode()) && count++ < 10000) {
      if (node.shadowRoot) scan(node.shadowRoot, depth + 1);
      if (node.localName === "iframe" || node.localName === "frame")
        try {
          const doc = node.contentDocument;
          if (doc) {
            attach(doc, depth + 1);
            scan(doc, depth + 1);
          }
        } catch {}
    }
  };
  state.enable = (enabled) => {
    state.picking = enabled;
    state.cancelled = false;
    if (enabled) {
      state.captured = null;
      attach(document);
      scan();
    } else hide();
  };
  attach(document);
  document.addEventListener("DOMContentLoaded", () => scan(), { once: true });
  new MutationObserver(() => {
    if (state.picking) scan();
  }).observe(document, { childList: true, subtree: true });
  Object.defineProperty(window, "__agentHubNativePreview", {
    value: state,
    configurable: false,
  });
})();
