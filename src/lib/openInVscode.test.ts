import { beforeEach, expect, it, vi } from "vitest";
import { openDirectoryInVscode, openFileInVscode } from "./openInVscode";

const openUrl = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
vi.mock("@tauri-apps/api/path", () => ({
  homeDir: async () => "/workspace/home",
  join: async (...parts: string[]) => parts.filter(Boolean).join("/"),
}));
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

it("opens a nested file with spaces, Unicode and URI punctuation encoded", async () => {
  await openFileInVscode("/workspace/task scripts", "scripts/check #中文.py");
  expect(openUrl).toHaveBeenCalledWith(
    "vscode://file/workspace/task%20scripts/scripts/check%20%23%E4%B8%AD%E6%96%87.py",
  );
});

it("expands home-relative file directories before opening", async () => {
  await openFileInVscode("~/tasks", "run.sh");
  expect(openUrl).toHaveBeenCalledWith(
    "vscode://file/workspace/home/tasks/run.sh",
  );
});
