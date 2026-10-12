// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import {
  createProjectSkill,
  createTeamStatus,
} from "../../tests/fixtures/projectSkill";
import { groupProjectSkills } from "../lib/projectSkillEntries";
import { useProjectSkillRestore } from "./useProjectSkillRestore";

const api = vi.hoisted(() => ({ update: vi.fn() }));
const feedback = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("../lib/tauri", () => ({ updateProjectSkillFromCenter: api.update }));
vi.mock("sonner", () => ({ toast: feedback }));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
const t = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
const onChanged = vi.fn();
let container: HTMLDivElement;
let root: Root;
let restore: ReturnType<typeof useProjectSkillRestore>;
function Harness({ projectId }: { projectId: string }) {
  const controller = useProjectSkillRestore(projectId, onChanged);
  useEffect(() => {
    restore = controller;
  }, [controller]);
  return (
    <p>
      {controller.confirmation?.skills.map((skill) => skill.name).join(",")}
    </p>
  );
}
function entry(status: "project_newer" | "center_newer" = "project_newer") {
  return groupProjectSkills(
    [createProjectSkill({ sync_status: status })],
    null,
  )[0];
}
beforeEach(() => {
  vi.clearAllMocks();
  api.update.mockReset().mockResolvedValue(undefined);
  onChanged.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(projectId = "project") {
  await act(async () => root.render(<Harness projectId={projectId} />));
}

it("uses a normal update when the center is newer", async () => {
  await render();
  await act(async () => restore.request(entry("center_newer")));
  expect(api.update).toHaveBeenCalledExactlyOnceWith(
    "project",
    "demo",
    "claude_code",
    false,
  );
  expect(restore.confirmation).toBeNull();
  expect(onChanged).toHaveBeenCalledOnce();
});
it("prompts on a fresh backend protection error even when the UI said center newer", async () => {
  api.update.mockRejectedValueOnce({
    kind: "project_restore_required",
    message: "local edits",
  });
  await render();
  await act(async () => restore.request(entry("center_newer")));
  expect(restore.confirmation?.skills[0].name).toBe("demo");
  expect(feedback.error).not.toHaveBeenCalled();
  await act(async () => restore.confirm());
  expect(api.update).toHaveBeenLastCalledWith(
    "project",
    "demo",
    "claude_code",
    true,
  );
});
it("confirms a mixed batch before any write and never includes project-only skills", async () => {
  const newer = entry();
  const center = { ...entry("center_newer"), id: "second", name: "second" };
  const only = { ...newer, status: "project_only" as const };
  await render();
  await act(async () => restore.requestBatch([newer, center, only]));
  expect(api.update).not.toHaveBeenCalled();
  expect(restore.confirmation?.skills).toEqual([newer, center]);
  await act(async () => restore.confirm());
  expect(api.update).toHaveBeenCalledTimes(2);
  expect(api.update.mock.calls.every((call) => call[3] === true)).toBe(true);
  expect(onChanged).toHaveBeenCalledOnce();
});

it("retries only failed skills after a partially successful forced batch", async () => {
  const first = entry();
  const second = { ...entry(), id: "second", name: "second" };
  api.update
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("Write failed"));
  await render();
  await act(async () => restore.requestBatch([first, second]));
  await act(async () => restore.confirm());
  expect(restore.confirmation?.skills).toEqual([second]);
  await act(async () => restore.confirm());
  expect(api.update).toHaveBeenCalledTimes(3);
  expect(restore.confirmation).toBeNull();
});
it("publishes a managed skill once and confirms independent Agent copy edits", async () => {
  const skill = entry("center_newer");
  skill.variants.push(
    createProjectSkill({ agent: "codex", sync_status: "center_newer" }),
  );
  skill.teamStatus = {
    ...createTeamStatus(),
    target_issues: [
      {
        agent: "codex",
        path: ".codex/skills/demo",
        reason: "content_mismatch",
      },
    ],
  };
  await render();
  await act(async () => restore.request(skill));
  expect(api.update).not.toHaveBeenCalled();
  await act(async () => restore.confirm());
  expect(api.update).toHaveBeenCalledTimes(1);
});
it("does not reuse a confirmation after navigation, including returning to the old project", async () => {
  await render("old");
  await act(async () => restore.request(entry()));
  await render("new");
  expect(restore.confirmation).toBeNull();
  await act(async () => restore.confirm());
  await render("old");
  expect(restore.confirmation).toBeNull();
  expect(api.update).not.toHaveBeenCalled();
});
it("prevents duplicate confirmations and does not refresh the next project with an old result", async () => {
  let resolve: () => void = () => {};
  api.update.mockReturnValueOnce(
    new Promise<void>((done) => {
      resolve = done;
    }),
  );
  await render("old");
  await act(async () => restore.request(entry()));
  await act(async () => {
    void restore.confirm();
    void restore.confirm();
  });
  expect(api.update).toHaveBeenCalledTimes(1);
  expect(restore.updatingSkill).toBe("demo");
  await render("new");
  await act(async () => resolve());
  expect(onChanged).not.toHaveBeenCalled();
  expect(feedback.success).not.toHaveBeenCalled();
  expect(restore.updatingSkill).toBeNull();
});
