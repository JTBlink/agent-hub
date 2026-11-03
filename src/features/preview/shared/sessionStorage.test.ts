// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { loadPreviewSession, savePreviewSession } from "./sessionStorage";
import { createSession, openPreview } from "./session";
afterEach(() => localStorage.clear());
it("never restores built-in or custom temporary profile tabs", () => {
  let state = openPreview(createSession(), {
    kind: "web",
    address: "https://example.invalid",
    title: "Persistent",
  });
  state = openPreview(state, {
    kind: "web",
    address: "https://example.invalid/guest",
    title: "Guest",
    profile: "guest",
  });
  state = openPreview(state, {
    kind: "web",
    address: "https://example.invalid/private",
    title: "Temporary",
    profile: "custom",
  });
  savePreviewSession(state, [
    { id: "custom", name: "Custom", ephemeral: true },
  ]);
  expect(loadPreviewSession().tabs.map((tab) => tab.title)).toEqual([
    "Persistent",
  ]);
});
it("restores metadata without claiming that a previous execution location is still verified", () => {
  const state = openPreview(createSession(), {
    kind: "web",
    address: "https://example.invalid",
    title: "Page",
  });
  state.tabs[0].execution = { render: "server", network: "proxy" };
  savePreviewSession(state);
  expect(loadPreviewSession().tabs[0].execution).toBeUndefined();
});
