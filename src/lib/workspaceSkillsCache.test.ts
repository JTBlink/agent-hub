import { beforeEach, expect, it, vi } from "vitest";
import { createProjectSkill } from "../../tests/fixtures/projectSkill";
import { workspaceSkillsCache as cache } from "./workspaceSkillsCache";
import { getGlobalLocalSkills } from "./tauri";

vi.mock("./tauri", () => ({ getGlobalLocalSkills: vi.fn() }));
const scan = vi.mocked(getGlobalLocalSkills);

beforeEach(() => {
  vi.resetAllMocks();
  cache.clear();
});

it("keeps a newer refresh when an older scan completes later", async () => {
  let resolveOld!: (skills: ReturnType<typeof createProjectSkill>[]) => void;
  scan.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  const old = cache.load("codex");
  await Promise.resolve();
  scan.mockResolvedValueOnce([]);
  await cache.load("codex", true);
  resolveOld([createProjectSkill()]);
  await old;
  expect(cache.getSnapshot().codex).toEqual([]);
});

it("revalidates loaded workspace totals after deployment data changes", async () => {
  scan.mockResolvedValueOnce([createProjectSkill()]);
  await cache.load("codex");
  scan.mockResolvedValueOnce([]);
  await cache.refreshLoaded();
  expect(cache.getSnapshot().codex).toEqual([]);
  expect(scan).toHaveBeenCalledTimes(2);
});
