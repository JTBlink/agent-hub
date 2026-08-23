import { describe, expect, it, vi } from "vitest";

import {
  selectMarketplaceManifest,
  selectSkillSourceDirectory,
  selectWorkspaceDirectory,
} from "./workspace-dialog";

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

  it("uses explicit pickers for local Skill sources and Marketplace manifests", async () => {
    const openDialog = vi
      .fn()
      .mockResolvedValueOnce("/skills")
      .mockResolvedValueOnce("/marketplace.json");

    await expect(selectSkillSourceDirectory(openDialog)).resolves.toBe(
      "/skills",
    );
    expect(openDialog).toHaveBeenNthCalledWith(1, {
      directory: true,
      multiple: false,
      title: "选择 Skill 来源目录",
    });

    await expect(selectMarketplaceManifest(openDialog)).resolves.toBe(
      "/marketplace.json",
    );
    expect(openDialog).toHaveBeenNthCalledWith(2, {
      directory: false,
      multiple: false,
      title: "选择 Marketplace manifest",
      filters: [{ name: "Marketplace JSON", extensions: ["json"] }],
    });
  });
});
