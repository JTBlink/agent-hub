import { beforeEach, expect, it, vi } from "vitest";
import { makeProject } from "../../tests/fixtures/workspace";
import { openProjectFolder } from "./openProject";
import * as api from "./tauri";
vi.mock("./tauri", () => ({
  pickDirectory: vi.fn(),
  resolveWorkspaceProject: vi.fn(),
}));
const project = makeProject();
beforeEach(() => vi.resetAllMocks());
it("cancels without resolving or registering a workspace", async () => {
  vi.mocked(api.pickDirectory).mockResolvedValue(null);
  expect(await openProjectFolder()).toBeNull();
  expect(api.resolveWorkspaceProject).not.toHaveBeenCalled();
});
it("uses canonical backend identity for both new and previously opened directories", async () => {
  vi.mocked(api.pickDirectory).mockResolvedValue("/workspace/demo-link");
  const opened = { project, directory: "/workspace/demo", visits: [] };
  vi.mocked(api.resolveWorkspaceProject).mockResolvedValue(opened);
  expect(await openProjectFolder()).toEqual(opened);
  expect(await openProjectFolder()).toEqual(opened);
  expect(api.resolveWorkspaceProject).toHaveBeenNthCalledWith(
    2,
    "/workspace/demo-link",
  );
});
it("preserves a registration failure for the UI to display", async () => {
  vi.mocked(api.pickDirectory).mockResolvedValue(project.path);
  vi.mocked(api.resolveWorkspaceProject).mockRejectedValue(
    new Error("directory unavailable"),
  );
  await expect(openProjectFolder()).rejects.toThrow("directory unavailable");
});
