import { beforeEach, expect, it, vi } from "vitest";
import { makeProject } from "../../tests/fixtures/workspace";
import { openProjectFolder } from "./openProject";
import * as api from "./tauri";
vi.mock("./tauri", () => ({
  pickDirectory: vi.fn(),
  getProjects: vi.fn(),
  addProject: vi.fn(),
}));
const project = makeProject();
beforeEach(() => {
  vi.resetAllMocks();
});
it("cancels without querying or registering projects", async () => {
  vi.mocked(api.pickDirectory).mockResolvedValue(null);
  expect(await openProjectFolder()).toBeNull();
  expect(api.getProjects).not.toHaveBeenCalled();
  expect(api.addProject).not.toHaveBeenCalled();
});
it("opens an already registered folder without adding it again", async () => {
  vi.mocked(api.pickDirectory).mockResolvedValue(project.path);
  vi.mocked(api.getProjects).mockResolvedValue([project]);
  expect(await openProjectFolder()).toEqual(project);
  expect(api.addProject).not.toHaveBeenCalled();
});
it("registers a newly selected directory", async () => {
  vi.mocked(api.pickDirectory).mockResolvedValue(project.path);
  vi.mocked(api.getProjects).mockResolvedValue([]);
  vi.mocked(api.addProject).mockResolvedValue(project);
  expect(await openProjectFolder()).toEqual(project);
  expect(api.addProject).toHaveBeenCalledWith(project.path);
});
it("reuses a project registered by a concurrent opener", async () => {
  vi.mocked(api.pickDirectory).mockResolvedValue(project.path);
  vi.mocked(api.getProjects)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([project]);
  vi.mocked(api.addProject).mockRejectedValue(new Error("duplicate"));
  expect(await openProjectFolder()).toEqual(project);
});
it("preserves a registration failure for the UI to display", async () => {
  vi.mocked(api.pickDirectory).mockResolvedValue(project.path);
  vi.mocked(api.getProjects).mockResolvedValue([]);
  vi.mocked(api.addProject).mockRejectedValue(
    new Error("directory unavailable"),
  );
  await expect(openProjectFolder()).rejects.toThrow("directory unavailable");
});
