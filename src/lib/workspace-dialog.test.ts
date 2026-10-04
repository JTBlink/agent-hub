import { describe, expect, it, vi } from "vitest";

import { selectWorkspaceDirectory } from "./workspace-dialog";

describe("workspace directory picker", () => {
  it("opens a single-directory dialog and returns the selected path", async () => {
    const openDialog = vi.fn().mockResolvedValue("/projects/agent-hub");

    await expect(selectWorkspaceDirectory(openDialog)).resolves.toBe(
      "/projects/agent-hub",
    );
    expect(openDialog).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "选择工作空间目录",
    });
  });

  it("returns null when the user cancels the dialog", async () => {
    const openDialog = vi.fn().mockResolvedValue(null);

    await expect(selectWorkspaceDirectory(openDialog)).resolves.toBeNull();
  });
});
