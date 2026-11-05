import { describe, expect, it } from "vitest";
import {
  createSession,
  openPreview,
  navigatePreview,
  addAnnotation,
  attachScreenshot,
  annotationsForPage,
  closePreview,
  restorePreview,
  resetDeletedProfile,
  formatAnnotations,
} from "./session";

describe("independent preview sessions", () => {
  it("keeps feedback bound to the document revision it was captured from", () => {
    let state = openPreview(createSession(), {
      kind: "markdown",
      address: "workspace:///guide.md",
      title: "guide.md",
    });
    const id = state.activeId!;
    state = addAnnotation(state, {
      id: "note",
      tabId: id,
      revision: state.tabs[0].revision,
      text: "Fix heading",
      selector: "h1",
      note: "Use sentence case",
    });
    expect(annotationsForPage(state, id)).toHaveLength(1);
    state = navigatePreview(state, id, "workspace:///other.md");
    expect(annotationsForPage(state, id)).toHaveLength(0);
    state = restorePreview(closePreview(state, id));
    expect(state.tabs[0].address).toBe("workspace:///other.md");
    expect(annotationsForPage(state, id)).toHaveLength(0);
  });
});

it("rejects attaching a late screenshot after navigation", () => {
  let state = openPreview(createSession(), {
    kind: "web",
    address: "https://example.invalid",
    title: "Page",
  });
  const id = state.activeId!;
  state = addAnnotation(state, {
    id: "note",
    tabId: id,
    revision: state.tabs[0].revision,
    text: "Text",
    selector: "p",
    note: "",
  });
  state = attachScreenshot(state, "note", "image");
  expect(state.annotations[0].screenshot).toBe("image");
  state = navigatePreview(state, id, "https://example.invalid/next");
  expect(() => attachScreenshot(state, "note", "late")).toThrow(
    "PREVIEW_STALE_CAPTURE",
  );
});

it("resets removed profile references and discards their obsolete feedback", () => {
  let state = openPreview(createSession(), {
    id: "tab",
    kind: "web",
    address: "about:blank",
    title: "Tab",
    profile: "custom",
  });
  state = addAnnotation(state, {
    id: "note",
    tabId: "tab",
    revision: state.tabs[0].revision,
    selector: "p",
    text: "Text",
    note: "",
  });
  state = closePreview(state, "tab");
  state = resetDeletedProfile(state, "custom");
  expect(state.closed[0].profile).toBe("default");
  expect(state.annotations).toEqual([]);
});

it("includes source range and measured element context in copied feedback", () => {
  const state = openPreview(createSession(), {
    kind: "markdown",
    address: "workspace:///guide.md",
    title: "guide.md",
  });
  const text = formatAnnotations(state.tabs[0], [
    {
      id: "note",
      tabId: state.activeId!,
      revision: state.tabs[0].revision,
      selector: "p",
      text: "Paragraph",
      note: "Change this",
      sourceLine: 5,
      sourceEndLine: 7,
      domPath: ["article", "p:nth-child(2)"],
      viewport: {
        width: 800,
        height: 600,
        dpr: 2,
        scrollX: 0,
        scrollY: 120,
        scale: 1,
      },
      bounds: { x: 0, y: 100, width: 700, height: 80 },
    },
  ]);
  expect(text).toContain("Source: guide.md:5-7");
  expect(text).toContain("DOM path: article > p:nth-child(2)");
  expect(text).toContain('"dpr":2');
  expect(text).toContain('"scrollY":120');
  expect(text).toContain('"height":80');
});

it("invalidates execution snapshots across close, restore and deleted-profile reset", () => {
  const state = openPreview(createSession(), {
    kind: "web",
    address: "https://example.invalid",
    title: "Page",
    profile: "remote",
  });
  const id = state.tabs[0].id;
  state.tabs[0].execution = { render: "server", network: "proxy" };
  const closed = closePreview(state, id);
  expect(closed.closed[0].execution).toBeUndefined();
  // Old in-memory history can still carry a snapshot; restoration must also clear it.
  closed.closed[0].execution = { render: "server", network: "proxy" };
  expect(restorePreview(closed).tabs[0].execution).toBeUndefined();
  expect(
    resetDeletedProfile(state, "remote").tabs[0].execution,
  ).toBeUndefined();
});
it("uses the local file path instead of its preview URL in delivery context", () => {
  const state = openPreview(createSession(), {
    kind: "html",
    address: "http://127.0.0.1:4000/preview",
    title: "Preview",
  });
  const text = formatAnnotations(
    state.tabs[0],
    [],
    "Update spacing",
    "/workspace/site/index.html",
  );
  expect(text).toContain("File: /workspace/site/index.html");
  expect(text).toContain("Update spacing");
  expect(text).not.toContain("http://");
});
