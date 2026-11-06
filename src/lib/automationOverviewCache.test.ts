// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { automationOverviewCache as cache } from "./automationOverviewCache";
import {
  getAutomationOverview,
  type AutomationOverview,
  type AutomationTask,
} from "./tauri";

vi.mock("./tauri", () => ({ getAutomationOverview: vi.fn() }));
const key = "agent-hub:automation-overview:v1";
const task: AutomationTask = {
  id: "managed:cleanup",
  name: "Cleanup",
  source: "launchd",
  origin: "agent_hub",
  identifier: null,
  bundle_id: null,
  icon: null,
  can_edit: true,
  can_run: true,
  definition: {
    name: "Cleanup",
    provider: "system",
    content: "private-command",
    files: [{ path: "scripts/run.sh", content: "private-script" }],
    workdir: "/workspace/demo",
    schedule: { kind: "interval", minutes: 10 },
    enabled: true,
  },
  revision: 3,
  is_builtin: false,
  schedule: "*/10 * * * *",
  project: "/workspace/demo",
  next_run: null,
  last_run: null,
  status: "active",
  last_result: "0",
  command: "private-command",
  prompt: "private-prompt",
  location: "/workspace/automation",
};
const overview = (name = "Cleanup"): AutomationOverview => ({
  tasks: [{ ...task, name }],
  issues: [],
  hermes_installed: false,
});
function deferred() {
  let resolve!: (value: AutomationOverview) => void;
  const promise = new Promise<AutomationOverview>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  cache.clear();
  vi.mocked(getAutomationOverview).mockReset();
});
afterEach(() => {
  cache.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("restores list fields immediately after a window reload and enables actions only after revalidation", async () => {
  vi.mocked(getAutomationOverview).mockResolvedValueOnce(overview());
  await cache.load("en");
  const saved = localStorage.getItem(key)!;
  expect(saved).not.toContain("private-");
  expect(saved).not.toContain("scripts/run.sh");
  cache.clear();
  localStorage.setItem(key, saved);
  const restored = cache.getSnapshot("en");
  expect(restored).toMatchObject({ loading: false, restored: true });
  expect(restored.data?.tasks[0]).toMatchObject({
    name: "Cleanup",
    status: "active",
    can_edit: false,
    can_run: false,
    revision: null,
    definition: { schedule: { kind: "interval", minutes: 10 }, content: "" },
  });
  const next = deferred();
  vi.mocked(getAutomationOverview).mockReturnValueOnce(next.promise);
  const loading = cache.load("en");
  expect(cache.getSnapshot("en").loading).toBe(false);
  next.resolve(overview("Updated"));
  await loading;
  expect(cache.getSnapshot("en")).toMatchObject({
    restored: false,
    data: {
      tasks: [{ name: "Updated", can_edit: true, can_run: true, revision: 3 }],
    },
  });
});

it("reuses fresh data for 15 seconds and bypasses freshness for manual refresh", async () => {
  vi.useFakeTimers();
  vi.mocked(getAutomationOverview).mockResolvedValue(overview());
  await cache.load("en");
  await cache.load("en");
  await cache.load("en");
  expect(getAutomationOverview).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(15_001);
  await cache.load("en");
  expect(getAutomationOverview).toHaveBeenCalledTimes(2);
  await cache.load("en", true, false);
  expect(getAutomationOverview).toHaveBeenCalledTimes(3);
});

it("coalesces changes received during a scan into one subsequent scan", async () => {
  const first = deferred(),
    next = deferred();
  vi.mocked(getAutomationOverview)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(next.promise);
  const initial = cache.load("en");
  for (let i = 0; i < 5; i++) void cache.load("en", true, true);
  await Promise.resolve();
  expect(getAutomationOverview).toHaveBeenCalledTimes(1);
  first.resolve(overview("Before change"));
  await initial;
  expect(getAutomationOverview).toHaveBeenCalledTimes(2);
  next.resolve(overview("After change"));
  await cache.load("en");
  expect(cache.getSnapshot("en").data?.tasks[0].name).toBe("After change");
});

it("does not persist an obsolete scan after an explicit invalidation", async () => {
  const old = deferred();
  vi.mocked(getAutomationOverview)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(overview("New"));
  const pending = cache.load("en");
  await cache.load("en", true, false);
  old.resolve(overview("Old"));
  await pending;
  const saved = localStorage.getItem(key)!;
  cache.clear();
  localStorage.setItem(key, saved);
  expect(cache.getSnapshot("en").data?.tasks[0].name).toBe("New");
});

it("ignores expired or corrupt storage and keeps working when storage is full", async () => {
  vi.useFakeTimers();
  vi.mocked(getAutomationOverview).mockResolvedValue(overview());
  await cache.load("en");
  const saved = localStorage.getItem(key)!;
  cache.clear();
  localStorage.setItem(key, saved);
  await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
  expect(cache.getSnapshot("en").data).toBeNull();
  cache.clear();
  localStorage.setItem(key, "broken json");
  expect(cache.getSnapshot("en").data).toBeNull();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  await cache.load("en");
  expect(cache.getSnapshot("en")).toMatchObject({
    error: null,
    data: { tasks: [{ name: "Cleanup" }] },
  });
});

it("keeps language summaries separate and persists an empty list after deletion", async () => {
  vi.mocked(getAutomationOverview)
    .mockResolvedValueOnce(overview("中文"))
    .mockResolvedValueOnce(overview("English"));
  await cache.load("zh");
  await cache.load("en");
  vi.mocked(getAutomationOverview).mockResolvedValueOnce({
    ...overview(),
    tasks: [],
  });
  await cache.load("en", true, false);
  const saved = localStorage.getItem(key)!;
  cache.clear();
  localStorage.setItem(key, saved);
  expect(cache.getSnapshot("zh").data?.tasks[0].name).toBe("中文");
  expect(cache.getSnapshot("en").data?.tasks).toEqual([]);
});
