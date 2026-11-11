// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PreviewDocument } from "../api";
import { previewApi } from "../api";
import { queuePreviewDocument } from "./openRequests";
import { useExternalPreviewOpens } from "./useExternalPreviewOpens";

const state = vi.hoisted(() => ({
  label: "main",
  signal: undefined as (() => void) | undefined,
  unlisten: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("../../../lib/workspaceWindow", () => ({
  workspaceWindowLabel: () => state.label,
  listenWorkspaceEvent: vi.fn(async (_event: string, callback: () => void) => {
    state.signal = callback;
    return state.unlisten;
  }),
}));
vi.mock("../api", () => ({
  previewApi: {
    takeExternalDocuments: vi.fn(),
    closeDocument: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("./openRequests", () => ({ queuePreviewDocument: vi.fn() }));
const document: PreviewDocument = {
  id: "document",
  title: "guide.md",
  kind: "markdown",
  content: "# Guide",
  revision: "first",
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
function Receiver() {
  useExternalPreviewOpens();
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.label = "main";
  state.signal = undefined;
  vi.mocked(previewApi.takeExternalDocuments).mockResolvedValue([]);
  host = window.document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("consumes files queued before startup and later native signals", async () => {
  vi.mocked(previewApi.takeExternalDocuments).mockResolvedValueOnce([document]);
  await act(async () => root.render(<Receiver />));
  expect(queuePreviewDocument).toHaveBeenCalledWith(document);
  vi.mocked(previewApi.takeExternalDocuments).mockResolvedValueOnce([
    { ...document, id: "next" },
  ]);
  await act(async () => state.signal?.());
  expect(queuePreviewDocument).toHaveBeenLastCalledWith({
    ...document,
    id: "next",
  });
  await act(async () => root.unmount());
  expect(state.unlisten).toHaveBeenCalledOnce();
  const reads = vi.mocked(previewApi.takeExternalDocuments).mock.calls.length;
  await act(async () => state.signal?.());
  expect(previewApi.takeExternalDocuments).toHaveBeenCalledTimes(reads);
});

it("leaves main-window requests untouched in another workspace", async () => {
  state.label = "workspace-other";
  await act(async () => root.render(<Receiver />));
  expect(previewApi.takeExternalDocuments).not.toHaveBeenCalled();
});

it("releases a grant that arrives after its receiver unmounts", async () => {
  let finish: ((documents: PreviewDocument[]) => void) | undefined;
  vi.mocked(previewApi.takeExternalDocuments).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => root.render(<Receiver />));
  await act(async () => root.unmount());
  await act(async () => finish?.([document]));
  expect(previewApi.closeDocument).toHaveBeenCalledWith(document.id);
  expect(queuePreviewDocument).not.toHaveBeenCalled();
});
