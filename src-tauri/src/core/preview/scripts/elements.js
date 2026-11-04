(() => {
  const LIMIT = 10000;
  const segment = (el) =>
    el.localName +
    (el.id
      ? "#" + CSS.escape(el.id)
      : ":nth-child(" +
        (Array.from(el.parentNode?.children || []).indexOf(el) + 1) +
        ")");
  const path = (element) => {
    const parts = [];
    for (let node = element; node && parts.length < 32;) {
      parts.unshift(segment(node));
      if (node.parentElement) node = node.parentElement;
      else if (node.getRootNode().host) {
        parts.unshift("::shadow");
        node = node.getRootNode().host;
      } else {
        try {
          node = node.ownerDocument.defaultView.frameElement;
        } catch {
          node = null;
        }
        if (node) parts.unshift("::frame");
      }
    }
    return parts;
  };
  const role = (el) =>
    el.getAttribute("role") ||
    {
      button: "button",
      a: el.hasAttribute("href") ? "link" : null,
      img: "img",
      textarea: "textbox",
      select: el.multiple ? "listbox" : "combobox",
      h1: "heading",
      h2: "heading",
      h3: "heading",
      h4: "heading",
      h5: "heading",
      h6: "heading",
      input:
        {
          checkbox: "checkbox",
          radio: "radio",
          button: "button",
          submit: "button",
          range: "slider",
          number: "spinbutton",
          search: "searchbox",
        }[el.type] || "textbox",
    }[el.localName] ||
    (el.isContentEditable ? "textbox" : null);
  const label = (el) => {
    const root = el.getRootNode();
    const ids = (el.getAttribute("aria-labelledby") || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return (
      el.getAttribute("aria-label") ||
      ids
        .map((id) => root.getElementById?.(id)?.textContent || "")
        .join(" ")
        .trim() ||
      Array.from(el.labels || [])
        .map((node) => node.textContent)
        .join(" ")
        .trim() ||
      el.getAttribute("alt") ||
      el.getAttribute("title") ||
      el.getAttribute("placeholder") ||
      (el.innerText || el.textContent || "").trim()
    ).slice(0, 500);
  };
  const bounds = (el) => {
    const box = el.getBoundingClientRect();
    let x = box.x,
      y = box.y,
      width = box.width,
      height = box.height,
      win = el.ownerDocument.defaultView;
    for (let depth = 0; win && win !== window && depth < 16; depth++) {
      let frame;
      try {
        frame = win.frameElement;
      } catch {
        break;
      }
      if (!frame) break;
      const rect = frame.getBoundingClientRect(),
        sx = frame.offsetWidth ? rect.width / frame.offsetWidth : 1,
        sy = frame.offsetHeight ? rect.height / frame.offsetHeight : 1;
      x = rect.x + (x + frame.clientLeft) * sx;
      y = rect.y + (y + frame.clientTop) * sy;
      width *= sx;
      height *= sy;
      win = frame.ownerDocument.defaultView;
    }
    return { x, y, width, height };
  };
  const live = (el) => {
    if (!el.isConnected) return false;
    let doc = el.ownerDocument;
    for (let depth = 0; doc !== document && depth < 16; depth++) {
      let frame;
      try {
        frame = doc.defaultView?.frameElement;
        if (!frame?.isConnected || frame.contentDocument !== doc) return false;
      } catch {
        return false;
      }
      doc = frame.ownerDocument;
    }
    return doc === document;
  };
  const visible = (el) => {
    const style = el.ownerDocument.defaultView.getComputedStyle(el),
      box = el.getBoundingClientRect();
    return (
      !el.hidden &&
      !el.closest('[hidden],[inert],[aria-hidden="true"]') &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.visibility !== "collapse" &&
      (!style.opacity || Number(style.opacity) !== 0) &&
      box.width > 0 &&
      box.height > 0
    );
  };
  const hit = (x, y, root = document, depth = 0) => {
    if (depth > 24) return null;
    const el = root.elementFromPoint?.(x, y);
    if (!el) return null;
    if (el.shadowRoot) {
      const inner = hit(x, y, el.shadowRoot, depth + 1);
      if (inner && inner !== el) return inner;
    }
    if (el.localName === "iframe" || el.localName === "frame") {
      try {
        const child = el.contentDocument,
          rect = el.getBoundingClientRect(),
          sx = el.offsetWidth ? rect.width / el.offsetWidth : 1,
          sy = el.offsetHeight ? rect.height / el.offsetHeight : 1;
        if (child)
          return (
            hit(
              (x - rect.x) / sx - el.clientLeft,
              (y - rect.y) / sy - el.clientTop,
              child,
              depth + 1,
            ) || el
          );
      } catch {
        /* Cross-origin frames remain represented by their visible frame element. */
      }
    }
    return el;
  };
  const collect = () => {
    const elements = [],
      frames = [];
    let visited = 0,
      truncated = false;
    const walk = (root, depth = 0) => {
      if (depth > 24) {
        truncated = true;
        return;
      }
      const walker =
        root.ownerDocument?.createTreeWalker(root, 1) ||
        document.createTreeWalker(root, 1);
      let el;
      while ((el = walker.nextNode())) {
        if (++visited > LIMIT || elements.length >= 500) {
          truncated = true;
          return;
        }
        if (
          el.matches(
            'a,button,input,textarea,select,[role],h1,h2,h3,h4,h5,h6,[contenteditable]:not([contenteditable="false"]),[tabindex],iframe,frame',
          ) &&
          visible(el)
        )
          elements.push(el);
        if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
        if (el.localName === "iframe" || el.localName === "frame") {
          try {
            if (el.contentDocument) walk(el.contentDocument, depth + 1);
            else if (frames.length < 50)
              frames.push({
                selector: path(el).join(" > ").slice(0, 500),
                available: false,
              });
          } catch {
            if (frames.length < 50)
              frames.push({
                selector: path(el).join(" > ").slice(0, 500),
                available: false,
              });
          }
        }
        if (truncated) return;
      }
    };
    walk(document);
    return { elements, frames, truncated };
  };
  const describe = (el) => {
    const box = bounds(el),
      css = el.ownerDocument.defaultView.getComputedStyle(el),
      domPath = path(el),
      scale = window.visualViewport?.scale || 1,
      ox = window.visualViewport?.offsetLeft || 0,
      oy = window.visualViewport?.offsetTop || 0;
    return {
      domPath,
      selector: domPath.join(" > "),
      text: (el.innerText || el.textContent || "").slice(0, 2000),
      html: el.outerHTML.slice(0, 4096),
      role: role(el),
      label: label(el),
      bounds: {
        x: (box.x - ox) * scale,
        y: (box.y - oy) * scale,
        width: box.width * scale,
        height: box.height * scale,
      },
      documentBounds: {
        x: box.x + scrollX,
        y: box.y + scrollY,
        width: box.width,
        height: box.height,
      },
      styles: Object.fromEntries(
        [
          "color",
          "background-color",
          "font-family",
          "font-size",
          "font-weight",
          "line-height",
          "padding",
          "margin",
          "display",
          "gap",
          "border-radius",
        ].map((key) => [key, css.getPropertyValue(key)]),
      ),
      url: location.href,
      title: document.title,
      revision: String(performance.timeOrigin),
      viewport: {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        scrollX,
        scrollY,
        scale,
      },
    };
  };
  return { hit, collect, describe, label, role, visible, bounds, path, live };
})();
