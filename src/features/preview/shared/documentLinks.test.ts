import { beforeEach, expect, it, vi } from "vitest";
import { openUrl } from "@tauri-apps/plugin-opener";
import { previewApi, type PreviewDocument } from "../api";
import { getSettings } from "../../../lib/tauri";
import {
  documentFragment,
  followDocumentLink,
  openPreviewAddress,
} from "./documentLinks";
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../../../lib/tauri", () => ({ getSettings: vi.fn() }));
vi.mock("../api", () => ({
  previewApi: {
    resourceLink: vi.fn(),
    openDocumentExternal: vi.fn(),
    openLink: vi.fn(),
    closeDocument: vi.fn(),
  },
}));
const document: PreviewDocument = {
  id: "source",
  kind: "markdown",
  title: "guide.md",
  content: "",
  revision: "first",
  url: "http://127.0.0.1:1234/source/guide.md",
};
const options = () => ({
  document,
  href: "next.md?mode=read#target",
  invert: false,
  profile: "guest",
  acceptDocument: vi.fn(),
  openPage: vi.fn(),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSettings).mockResolvedValue(null);
});
it("uses only an existing authorized resource URL for the system destination, preserving suffixes", async () => {
  const url = "http://source.agent-hub.localhost:1234/next.md?mode=read#target";
  vi.mocked(previewApi.resourceLink).mockResolvedValue(url);
  await followDocumentLink(options());
  expect(previewApi.resourceLink).toHaveBeenCalledExactlyOnceWith(
    "source",
    "next.md?mode=read#target",
  );
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(url);
  expect(previewApi.openLink).not.toHaveBeenCalled();
});
it("inverts to a document tab and preserves its decoded fragment and opener profile", async () => {
  const target = {
    ...document,
    id: "linked",
    url: "http://127.0.0.1:1234/linked/next.md?mode=read#target%20heading",
  };
  vi.mocked(previewApi.openLink).mockResolvedValue({
    kind: "document",
    document: target,
  });
  const request = { ...options(), invert: true };
  await followDocumentLink(request);
  expect(request.acceptDocument).toHaveBeenCalledWith(
    {
      ...target,
      fragment: "target heading",
    },
    "guest",
  );
  expect(openUrl).not.toHaveBeenCalled();
});
it("keeps the opener profile for browser resources and respects inversion from a module default", async () => {
  vi.mocked(getSettings).mockResolvedValue("preview");
  vi.mocked(previewApi.openLink).mockResolvedValue({
    kind: "page",
    url: "http://source.agent-hub.localhost:1234/report.pdf#page=2",
  });
  const request = options();
  await followDocumentLink(request);
  expect(request.openPage).toHaveBeenCalledWith(
    "http://source.agent-hub.localhost:1234/report.pdf#page=2",
    "guest",
  );
  vi.mocked(previewApi.resourceLink).mockRejectedValueOnce(
    Error("not authorized"),
  );
  await expect(
    followDocumentLink({ ...request, invert: true }),
  ).rejects.toThrow("not authorized");
  expect(openUrl).not.toHaveBeenCalled();
});
it("handles malformed fragment escapes as text without losing the new grant", () => {
  expect(documentFragment("http://127.0.0.1/guide.md#bad%ZZ")).toBe("bad%ZZ");
});

it("opens local preview files externally without a resource server, preserving query and fragment", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  await openPreviewAddress(
    `http://${id}.agent-hub.localhost:4321/path%20name.html?mode=read#p12`,
  );
  expect(previewApi.openDocumentExternal).toHaveBeenCalledExactlyOnceWith(
    id,
    "/path%20name.html?mode=read#p12",
  );
  expect(previewApi.resourceLink).not.toHaveBeenCalled();
  expect(openUrl).not.toHaveBeenCalled();
});
it("refuses expired document grants without opening a server URL, and preserves ordinary website addresses", async () => {
  vi.mocked(previewApi.openDocumentExternal).mockRejectedValueOnce(
    new Error("expired"),
  );
  await expect(
    openPreviewAddress("http://expired.agent-hub.localhost:4321/page.html"),
  ).rejects.toThrow("expired");
  expect(openUrl).not.toHaveBeenCalled();
  await openPreviewAddress("https://example.invalid/path");
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(
    "https://example.invalid/path",
  );
});

it("opens a document-backed development page as the original local file and leaves unrelated websites as URLs", async () => {
  const local: PreviewDocument = {
    ...document,
    kind: "html",
    path: "/workspace/demo/report.html",
    url: "http://127.0.0.1:5173/report.html",
  };
  await openPreviewAddress(
    "http://127.0.0.1:5173/report.html?mode=read#p12",
    local,
  );
  expect(previewApi.openDocumentExternal).toHaveBeenCalledExactlyOnceWith(
    "source",
    "?mode=read#p12",
  );
  expect(openUrl).not.toHaveBeenCalled();
  await openPreviewAddress("https://example.invalid/path", local);
  expect(openUrl).toHaveBeenCalledExactlyOnceWith(
    "https://example.invalid/path",
  );
});
