import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { annotationMarkersScript } from "./useAnnotationMarkers";
import type { Annotation } from "./session";

it("numbers page markers with the same list order, follows element scroll, and removes deleted or stale markers", () => {
  const dom = new JSDOM('<h1 id="target">Heading</h1>', {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.invalid",
  });
  const win = dom.window;
  const revision = String(win.performance.timeOrigin);
  let y = 100;
  const target = win.document.querySelector("h1")!;
  target.getBoundingClientRect = () => ({
    x: 20,
    y,
    width: 100,
    height: 40,
    top: y,
    left: 20,
    right: 120,
    bottom: y + 40,
    toJSON: () => ({}),
  });
  const notes: Annotation[] = [
    {
      id: "text",
      tabId: "one",
      revision,
      note: "",
      selector: "[text]",
      text: "No position",
    },
    {
      id: "element",
      tabId: "one",
      revision,
      note: "",
      selector: "h1#target",
      text: "Heading",
      domPath: ["h1#target"],
      bounds: { x: 20, y: 100, width: 100, height: 40 },
    },
  ];
  const run = (values: Annotation[], expected = revision) =>
    win.eval(
      annotationMarkersScript(expected, values, {
        background: "#1e66f5",
        foreground: "#ffffff",
      }),
    );
  const marker = () =>
    win.document
      .querySelector("[data-agent-hub-annotation-markers]")
      ?.shadowRoot?.querySelector<HTMLElement>(".marker");
  try {
    run(notes);
    expect(marker()?.textContent).toBe("2");
    expect(marker()?.style.transform).toBe("translate(58px,128px)");
    y = 20;
    // Inject a synchronous RAF so the test exercises the actual scroll handler.
    win.requestAnimationFrame = (callback) => {
      callback(0);
      return 0;
    };
    win.dispatchEvent(new win.Event("scroll"));
    expect(marker()?.style.transform).toBe("translate(58px,48px)");
    y = -200;
    win.dispatchEvent(new win.Event("scroll"));
    expect(marker()?.style.display).toBe("none");
    run([]);
    expect(marker()).toBeUndefined();
    run(notes, `${revision}:0:${win.location.href}`);
    expect(marker()?.textContent).toBe("2");
    run(notes, "outdated");
    expect(marker()).toBeUndefined();
    run(notes);
    run(notes);
    expect(
      win.document.querySelectorAll("[data-agent-hub-annotation-markers]"),
    ).toHaveLength(1);
  } finally {
    run([]);
    win.close();
  }
});
