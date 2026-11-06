(options) => {
  const key = "__agentHubAnnotationMarkers";
  const previous = window[key];
  previous?.dispose();
  delete window[key];
  const revision = String(performance.timeOrigin);
  const nativeRevision =
    revision +
    ":" +
    (window.__agentHubNativePreview?.navigation || 0) +
    ":" +
    location.href;
  if (
    !options.markers.length ||
    (options.url && options.url !== location.href) ||
    (!/^[^:]+:\d+:\d+:[a-f0-9]{64}$/i.test(options.revision) &&
      options.revision !== revision &&
      options.revision !== nativeRevision)
  )
    return true;
  const host = document.createElement("div");
  host.setAttribute("data-agent-hub-annotation-markers", "");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:hidden;contain:layout style paint;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent =
    ".marker{box-sizing:border-box;position:absolute;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;border:2px solid;font:600 12px/1 system-ui,sans-serif;box-shadow:0 2px 6px rgb(0 0 0 / .2);pointer-events:none;user-select:none;}";
  shadow.append(style);
  document.documentElement.append(host);
  const entries = options.markers.map((marker) => {
    const bubble = document.createElement("span");
    bubble.className = "marker";
    bubble.textContent = String(marker.number);
    bubble.style.backgroundColor = options.background;
    bubble.style.color = options.foreground;
    bubble.style.borderColor = options.foreground;
    shadow.append(bubble);
    return { marker, bubble };
  });
  const resolve = (path) => {
    let root = document,
      parts = [];
    for (const segment of path) {
      if (segment === "::shadow" || segment === "::frame") {
        const element = root?.querySelector(parts.join(" > "));
        root =
          segment === "::shadow"
            ? element?.shadowRoot
            : element?.contentDocument;
        parts = [];
      } else parts.push(segment);
    }
    return root?.querySelector(parts.join(" > "));
  };
  const bounds = (element) => {
    let rect = element.getBoundingClientRect();
    let x = rect.x,
      y = rect.y,
      width = rect.width,
      height = rect.height;
    let view = element.ownerDocument.defaultView;
    while (view && view !== window) {
      const frame = view.frameElement;
      if (!frame) break;
      rect = frame.getBoundingClientRect();
      const sx = frame.offsetWidth ? rect.width / frame.offsetWidth : 1;
      const sy = frame.offsetHeight ? rect.height / frame.offsetHeight : 1;
      x = rect.x + (x + frame.clientLeft) * sx;
      y = rect.y + (y + frame.clientTop) * sy;
      width *= sx;
      height *= sy;
      view = frame.ownerDocument.defaultView;
    }
    return { x, y, width, height };
  };
  let raf = 0;
  const update = () => {
    raf = 0;
    if (!host.isConnected) return;
    const vv = window.visualViewport;
    for (const { marker, bubble } of entries) {
      let rect;
      try {
        const element = resolve(marker.path);
        if (element) rect = bounds(element);
      } catch {
        /* Closed or cross-origin trees use the captured document bounds. */
      }
      rect ??= {
        ...marker.bounds,
        x: marker.bounds.x - window.scrollX,
        y: marker.bounds.y - window.scrollY,
      };
      const x = rect.x - (vv?.offsetLeft || 0),
        y = rect.y - (vv?.offsetTop || 0);
      const visible =
        rect.width >= 0 &&
        rect.height >= 0 &&
        x + rect.width >= 0 &&
        y + rect.height >= 0 &&
        x < (vv?.width || innerWidth) &&
        y < (vv?.height || innerHeight);
      bubble.style.display = visible ? "flex" : "none";
      bubble.style.transform = `translate(${Math.max(0, x + rect.width / 2 - 12)}px,${Math.max(0, y + rect.height - 12)}px)`;
    }
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  // Scroll events do not cross iframe documents.
  const frameDocuments = new Set();
  for (const { marker } of entries) {
    try {
      const doc = resolve(marker.path)?.ownerDocument;
      if (doc && doc !== document) frameDocuments.add(doc);
    } catch {
      /* Inaccessible frames cannot register listeners. */
    }
  }
  for (const doc of frameDocuments)
    doc.addEventListener("scroll", schedule, true);
  window[key] = {
    dispose() {
      observer.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      for (const doc of frameDocuments)
        doc.removeEventListener("scroll", schedule, true);
      host.remove();
    },
  };
  update();
  return true;
};
