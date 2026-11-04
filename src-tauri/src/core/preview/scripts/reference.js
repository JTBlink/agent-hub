(() => {
  const reference = __REFERENCE__,
    value = __VALUE__,
    operation = __OPERATION__,
    context = __ELEMENT_CONTEXT__;
  const parts = reference.split(":"),
    index = Number(parts[1]),
    snapshot = window.__agentHubSnapshots?.get(parts[0]);
  if (
    parts.length !== 2 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 500 ||
    snapshot?.url !== location.href ||
    snapshot.navigation !== (window.__agentHubNativePreview?.navigation || 0)
  )
    throw Error("Snapshot expired");
  const node = snapshot.nodes[index];
  if (!node || !context.live(node) || !context.visible(node))
    throw Error("Element is unavailable; take another snapshot");
  if (operation === "inspect") return context.describe(node);
  if (
    node.matches(":disabled") ||
    node.getAttribute("aria-disabled") === "true"
  )
    throw Error("Element is unavailable; take another snapshot");
  if (operation === "fill") {
    if (
      node.readOnly ||
      node.getAttribute("aria-readonly") === "true" ||
      [
        "button",
        "submit",
        "reset",
        "checkbox",
        "radio",
        "file",
        "image",
        "hidden",
      ].includes(node.type)
    )
      throw Error("Element is not editable");
    const editable = ["input", "textarea", "select"].includes(node.localName);
    if (!editable && !node.isContentEditable)
      throw Error("Element is not editable");
    if (
      node.localName === "select" &&
      !Array.from(node.options).some(
        (option) => option.value === value && !option.disabled,
      )
    )
      throw Error("Select option unavailable");
    node.focus();
    if (editable) {
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(node),
        "value",
      )?.set;
      if (!setter) throw Error("Element is not editable");
      setter.call(node, value);
    } else node.textContent = value;
    const View = node.ownerDocument.defaultView;
    node.dispatchEvent(
      new View.Event("input", { bubbles: true, composed: true }),
    );
    node.dispatchEvent(new View.Event("change", { bubbles: true }));
  } else {
    node.scrollIntoView({ block: "center", inline: "center" });
    const rect = context.bounds(node),
      hit = context.hit(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (!hit || (hit !== node && !node.contains(hit)))
      throw Error("Element is covered; take another snapshot");
    node.click();
  }
  return true;
})();
