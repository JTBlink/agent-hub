import { expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { previewApi } from "../api";
import { annotationActions } from "./annotationActions";
import { createSession, openPreview } from "./session";
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("../api", () => ({ previewApi: { export: vi.fn() } }));
it("blocks clipboard and export on an unverified revision and reports failure", async () => {
  const tab = openPreview(createSession(), {
    kind: "web",
    address: "https://example.invalid",
    title: "Example",
  }).tabs[0];
  const verify = vi.fn().mockRejectedValue(Error("stale"));
  const onError = vi.fn();
  const onCopied = vi.fn();
  const actions = annotationActions({
    tab,
    pageId: "owned-page",
    notes: [],
    verify,
    onCopied,
    onError,
  });
  await actions.copyNotes();
  await actions.exportNotes();
  expect(writeText).not.toHaveBeenCalled();
  expect(previewApi.export).not.toHaveBeenCalled();
  expect(onCopied).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledTimes(2);
  verify.mockResolvedValue(undefined);
  await actions.copyNotes();
  await actions.exportNotes();
  expect(verify).toHaveBeenLastCalledWith(tab.id, tab.revision);
  expect(writeText).toHaveBeenCalledOnce();
  expect(previewApi.export).toHaveBeenCalledExactlyOnceWith(
    "page-feedback.md",
    expect.any(String),
    false,
    { id: "owned-page", revision: tab.revision },
  );
  expect(onCopied).toHaveBeenCalledOnce();
});
