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
