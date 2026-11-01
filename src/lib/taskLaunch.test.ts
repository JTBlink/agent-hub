import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { launchTaskAgent } from "./taskLaunch";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => vi.mocked(invoke).mockReset());
const target = {
  session: "selected-session",
  workspace_id: "w1",
  pane_id: "w1:p1",
  terminal_id: "native-1",
  revision: 1,
  agent_session: null,
};
const workspace = { project_id: "demo", path: "/projects/demo", target };
const input = {
  projectId: "demo",
  path: workspace.path,
  session: target.session,
  kind: "codex",
  name: "task-7",
  prompt: "Complete the task",
};

it("uses the explicitly selected session and returns an inspection target on unconfirmed startup", async () => {
  vi.mocked(invoke)
    .mockResolvedValueOnce(workspace)
    .mockRejectedValueOnce(new Error("Startup timed out"));
  const result = await launchTaskAgent(input);
  expect(invoke).toHaveBeenNthCalledWith(1, "herdr_ensure", {
    session: input.session,
    projectId: input.projectId,
    worktreePath: input.path,
  });
  expect(result).toEqual({
    attachment: workspace,
    warning: "Startup timed out",
  });
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("preserves the newly created Agent target when final focus fails", async () => {
  const agent = { ...target, pane_id: "w1:p2" };
  vi.mocked(invoke)
    .mockResolvedValueOnce(workspace)
    .mockResolvedValueOnce({ target: agent, warning: null })
    .mockRejectedValueOnce(new Error("Focus failed"));
  const result = await launchTaskAgent(input);
  expect(result.attachment.target).toEqual(agent);
  expect(result.warning).toContain("Focus failed");
});
