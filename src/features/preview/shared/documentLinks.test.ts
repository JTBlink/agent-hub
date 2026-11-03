import { beforeEach, expect, it, vi } from "vitest";
import { openUrl } from "@tauri-apps/plugin-opener";
import { previewApi, type PreviewDocument } from "../api";
import { getSettings } from "../../../lib/tauri";
import { documentFragment, followDocumentLink } from "./documentLinks";
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../../../lib/tauri", () => ({ getSettings: vi.fn() }));
vi.mock("../api", () => ({
  previewApi: {
    resourceLink: vi.fn(),
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
