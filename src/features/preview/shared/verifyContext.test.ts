import { expect, it, vi } from "vitest";
import { previewApi } from "../api";
import { createSession, openPreview } from "./session";
import { verifyPreviewContext } from "./verifyContext";
vi.mock("../api", () => ({ previewApi: { action: vi.fn() } }));
const web = () =>
  openPreview(createSession(), {
    kind: "web",
    address: "https://example.invalid",
    title: "Example",
  }).tabs[0];
it("checks native identity even when the UI still has the old revision and propagates disconnects", async () => {
  const tab = web();
  const current = () => ({ tab, pageId: "owned-page" });
  vi.mocked(previewApi.action).mockRejectedValueOnce(Error("Page changed"));
  await expect(verifyPreviewContext(tab, current, "changed")).rejects.toThrow(
    "Page changed",
  );
  expect(previewApi.action).toHaveBeenLastCalledWith("owned-page", {
    kind: "verify_revision",
    expected_revision: tab.revision,
  });
  vi.mocked(previewApi.action).mockRejectedValueOnce(Error("Disconnected"));
  await expect(verifyPreviewContext(tab, current, "changed")).rejects.toThrow(
    "Disconnected",
  );
});
it("rejects tab replacement, revision changes and page remapping during the native check", async () => {
  for (const change of ["closed", "revision", "page"]) {
    const tab = web();
    let snapshot: { tab?: typeof tab; pageId?: string } = {
      tab,
      pageId: "page",
    };
    vi.mocked(previewApi.action).mockImplementationOnce(async () => {
      snapshot =
        change === "closed"
          ? {}
          : change === "revision"
            ? { tab: { ...tab, revision: "new" }, pageId: "page" }
            : { tab, pageId: "replacement" };
    });
    await expect(
      verifyPreviewContext(tab, () => snapshot, "changed"),
    ).rejects.toThrow("changed");
  }
});
it("validates Markdown locally and refuses unloaded browser contexts", async () => {
  vi.mocked(previewApi.action).mockClear();
  const tab = { ...web(), kind: "markdown" as const };
  await verifyPreviewContext(tab, () => ({ tab }), "changed");
  expect(previewApi.action).not.toHaveBeenCalled();
  await expect(
    verifyPreviewContext(
      { ...tab, revision: "old" },
      () => ({ tab }),
      "changed",
    ),
  ).rejects.toThrow("changed");
  const browser = web();
  await expect(
    verifyPreviewContext(browser, () => ({ tab: browser }), "changed"),
  ).rejects.toThrow("changed");
});
