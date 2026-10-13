import { beforeEach, expect, it, vi } from "vitest";
import { openDirectoryInVscode } from "./openInVscode";

const openUrl = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
beforeEach(() => openUrl.mockReset().mockResolvedValue(undefined));

it("launches VS Code with an encoded absolute directory", async () => {
  await openDirectoryInVscode("/workspace/skills/demo #中文");
  expect(openUrl).toHaveBeenCalledWith(
    "vscode://file/workspace/skills/demo%20%23%E4%B8%AD%E6%96%87",
  );
});

it("rejects invalid directories before calling the opener", async () => {
  await expect(openDirectoryInVscode("~/skills/demo")).rejects.toThrow();
  expect(openUrl).not.toHaveBeenCalled();
});

it("propagates launch failures for callers to report", async () => {
  const error = new Error("Editor unavailable");
  openUrl.mockRejectedValueOnce(error);
  await expect(openDirectoryInVscode("/workspace/demo")).rejects.toBe(error);
});
