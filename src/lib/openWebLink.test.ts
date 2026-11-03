// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getSettings } from "./tauri";
import { openWebLink, invertLinkDestination } from "./openWebLink";
import {
  consumePreviewRequests,
  queuePreviewWeb,
  type PreviewOpenRequest,
} from "../features/preview/shared/openRequests";
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("./tauri", () => ({ getSettings: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  consumePreviewRequests(() => {})();
  vi.mocked(getSettings).mockResolvedValue(null);
});
it("preserves the system default and applies inversion to both destinations", async () => {
  const requests: PreviewOpenRequest[] = [];
  const stop = consumePreviewRequests((request) => requests.push(request));
  await openWebLink("https://example.invalid/a");
  expect(openUrl).toHaveBeenCalledExactlyOnceWith("https://example.invalid/a");
  await openWebLink("https://example.invalid/b", { invert: true });
  expect(requests).toEqual([
    { kind: "web", address: "https://example.invalid/b", profile: "default" },
  ]);
  vi.mocked(getSettings).mockResolvedValue("preview");
  await openWebLink("https://example.invalid/c", { profile: "guest" });
  expect(requests[1]).toMatchObject({ profile: "guest" });
  await openWebLink("https://example.invalid/d", { invert: true });
  expect(openUrl).toHaveBeenLastCalledWith("https://example.invalid/d");
  stop();
});
it("rejects unsafe schemes and reports setting failures without opening another destination", async () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///tmp/a",
    "data:text/html,x",
    "https://example.invalid/" + "a".repeat(8192),
  ])
    await expect(openWebLink(url)).rejects.toThrow();
  expect(getSettings).not.toHaveBeenCalled();
  vi.mocked(getSettings).mockRejectedValue(new Error("settings unavailable"));
  await expect(openWebLink("https://example.invalid")).rejects.toThrow(
    "settings unavailable",
  );
  expect(openUrl).not.toHaveBeenCalled();
});
it("bounds lazy requests and delivers duplicate URLs as distinct opens", () => {
  for (let n = 0; n < 14; n++) queuePreviewWeb(`https://example.invalid/${n}`);
  const received: PreviewOpenRequest[] = [];
  const stop = consumePreviewRequests((request) => received.push(request));
  expect(received).toHaveLength(12);
  expect(received[0]).toMatchObject({ address: "https://example.invalid/2" });
  queuePreviewWeb("https://example.invalid/13");
  expect(received).toHaveLength(13);
  stop();
});
it("requires shift and a platform action modifier to invert", () => {
  expect(
    invertLinkDestination({ shiftKey: true, ctrlKey: false, metaKey: true }),
  ).toBe(true);
  expect(
    invertLinkDestination({ shiftKey: true, ctrlKey: true, metaKey: false }),
  ).toBe(true);
  expect(
    invertLinkDestination({ shiftKey: false, ctrlKey: true, metaKey: false }),
  ).toBe(false);
});
