import { createInstance } from "i18next";
import { beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import * as api from "./tauri";
import { uploadProjectSkillToGroup } from "./projectSkillUpload";

vi.mock("./tauri", () => ({
  updateProjectSkillToCenter: vi.fn(),
  setSkillGroupMembership: vi.fn(),
  getManagedSkills: vi.fn(),
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
const variant = { relative_path: "demo", agent: "claude_code" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.updateProjectSkillToCenter).mockResolvedValue("uploaded-id");
  vi.mocked(api.setSkillGroupMembership).mockResolvedValue([]);
  vi.mocked(api.getManagedSkills).mockResolvedValue([]);
});
it("groups the actual returned central skill, including newly imported skills", async () => {
  await uploadProjectSkillToGroup("project", variant, "selected-group", i18n.t);
  expect(api.updateProjectSkillToCenter).toHaveBeenCalledWith(
    "project",
    "demo",
    "claude_code",
  );
  expect(api.setSkillGroupMembership).toHaveBeenCalledWith(
    ["uploaded-id"],
    "selected-group",
    true,
  );
});
it("leaves existing membership unchanged when no group selection is supplied", async () => {
  await uploadProjectSkillToGroup("project", variant, undefined, i18n.t);
  expect(api.getManagedSkills).not.toHaveBeenCalled();
  expect(api.setSkillGroupMembership).not.toHaveBeenCalled();
});
it("removes existing membership when ungrouped is selected", async () => {
  // Only the fields consumed by the upload flow are relevant to this fixture.
  vi.mocked(api.getManagedSkills).mockResolvedValue([
    {
      id: "uploaded-id",
      name: "demo",
      description: null,
      version: null,
      source_type: "local",
      source_ref: null,
      source_ref_resolved: null,
      source_subpath: null,
      source_branch: null,
      source_revision: null,
      source_agent: null,
      remote_revision: null,
      update_status: "local_only",
      last_checked_at: null,
      last_check_error: null,
      central_path: "<library>/demo",
      enabled: true,
      created_at: 0,
      updated_at: 0,
      status: "ok",
      targets: [],
      skill_group_ids: ["old-group"],
      tags: [],
    },
  ]);
  await uploadProjectSkillToGroup("project", variant, "", i18n.t);
  expect(api.setSkillGroupMembership).toHaveBeenCalledWith(
    ["uploaded-id"],
    "old-group",
    false,
  );
});
it("does not change membership when upload fails", async () => {
  vi.mocked(api.updateProjectSkillToCenter).mockRejectedValue(
    new Error("upload failed"),
  );
  await expect(
    uploadProjectSkillToGroup("project", variant, "group", i18n.t),
  ).rejects.toThrow("upload failed");
  expect(api.setSkillGroupMembership).not.toHaveBeenCalled();
});
it("explains partial completion when membership cannot be saved", async () => {
  vi.mocked(api.setSkillGroupMembership).mockRejectedValue(
    new Error("group missing"),
  );
  await expect(
    uploadProjectSkillToGroup("project", variant, "group", i18n.t),
  ).rejects.toThrow("技能已上传到中心，但设置技能组失败：group missing");
});
