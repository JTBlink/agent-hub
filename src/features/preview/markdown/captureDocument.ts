import { previewApi } from "../api";
/** Clone the rendered document with computed styling, then capture it in the isolated browser. */
export async function captureDocument(
  element: HTMLElement,
  profile: string,
  full: boolean,
  bounds?: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const clone = element.cloneNode(true);
  if (!(clone instanceof HTMLElement))
    throw new Error("Document capture unavailable");
  const source = [element, ...element.querySelectorAll<HTMLElement>("*")];
  const target = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  if (source.length > 5000)
    throw new Error("Document exceeds the screenshot limit");
  const properties = [
    "display",
    "color",
    "background-color",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "line-height",
    "letter-spacing",
    "text-align",
    "text-decoration",
    "white-space",
    "word-break",
    "overflow-wrap",
    "padding",
    "margin",
    "border",
    "border-radius",
    "list-style-type",
    "width",
    "max-width",
    "height",
    "box-sizing",
    "vertical-align",
  ];
  source.forEach((node, index) => {
    const copy = target[index];
    if (!copy) return;
    const style = getComputedStyle(node);
    for (const property of properties)
      copy.style.setProperty(property, style.getPropertyValue(property));
    copy.removeAttribute("id");
    copy.removeAttribute("data-highlight");
    if (copy.tagName === "IMG" && node instanceof HTMLImageElement) {
      const url = new URL(node.currentSrc || node.src);
      if (url.hostname === "127.0.0.1") {
        const [grant, ...path] = url.pathname.slice(1).split("/");
        url.hostname = `${grant}.agent-hub.localhost`;
        url.pathname = `/${path.join("/")}`;
      }
      copy.setAttribute("src", url.href);
      copy.setAttribute("loading", "eager");
    }
  });
  clone.style.margin = "0";
  clone.style.maxWidth = "none";
  const width = Math.min(3840, Math.max(240, element.offsetWidth));
  const viewport = element.parentElement;
  const height = Math.min(
    2160,
    Math.max(200, viewport?.clientHeight ?? element.offsetHeight),
  );
  const clip = full
    ? undefined
    : (bounds ?? { x: 0, y: viewport?.scrollTop ?? 0, width, height });
  return previewApi.captureRendered(
    `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0}*{box-sizing:border-box}</style><body>${clone.outerHTML}</body></html>`,
    width,
    height,
    profile,
    full,
    clip,
  );
}
