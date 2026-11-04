((token) => {
  const context = __ELEMENT_CONTEXT__;
  let { elements: nodes, frames, truncated } = context.collect();
  if (!(window.__agentHubSnapshots instanceof Map))
    window.__agentHubSnapshots = new Map();
  const nativeRevision = window.__agentHubNativePreview?.navigation || 0;
  const selected = [],
    elements = [];
  let bytes = 0;
  for (const el of nodes) {
    const item = {
      ref: token + ":" + selected.length,
      tag: el.localName,
      text: (el.innerText || el.textContent || "").slice(0, 200),
      label: context.label(el),
      selector: context.path(el).join(" > ").slice(0, 2000),
      bounds: context.bounds(el),
      type: el.getAttribute("type"),
      role: context.role(el),
      disabled:
        el.matches(":disabled") || el.getAttribute("aria-disabled") === "true",
      readOnly: !!el.readOnly || el.getAttribute("aria-readonly") === "true",
    };
    bytes += JSON.stringify(item).length;
    if (bytes > 256000) {
      truncated = true;
      break;
    }
    selected.push(el);
    elements.push(item);
  }
  window.__agentHubSnapshots.set(token, {
    url: location.href,
    navigation: nativeRevision,
    nodes: selected,
  });
  while (window.__agentHubSnapshots.size > 8)
    window.__agentHubSnapshots.delete(
      window.__agentHubSnapshots.keys().next().value,
    );
  return {
    url: location.href,
    title: document.title.slice(0, 500),
    revision: String(performance.timeOrigin),
    text: (document.body?.innerText || "").slice(0, 32000),
    frames,
    truncated,
    elements,
  };
})("__SNAPSHOT_ID__");
