// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { getProjectGitStatus, type GitStatus } from "./gitApi";
import { peekProjectGitStatus } from "./projectGitStatus";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const snapshot: GitStatus = {
  branch: "main",
  head: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  state: "Clean",
  files: [],
  commits: [],
  truncated: false,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(invoke).mockReset();
  window.dispatchEvent(new Event("project-git-changed"));
});
afterEach(() => vi.useRealTimers());

it("caches an ordinary folder and reloads after explicit initialization", async () => {
  vi.mocked(invoke).mockResolvedValueOnce(null).mockResolvedValue(snapshot);
  expect(await getProjectGitStatus("ordinary")).toBeNull();
  expect(await getProjectGitStatus("ordinary")).toBeNull();
  expect(invoke).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event("project-git-changed"));
  expect(await getProjectGitStatus("ordinary")).toEqual(snapshot);
});

it("shares the sidebar's scan with source control and reuses its recent snapshot on entry", async () => {
  let finish!: (value: GitStatus) => void;
  vi.mocked(invoke).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const sidebar = getProjectGitStatus("demo", "<workspace>/main");
  const page = getProjectGitStatus("demo", "<workspace>/main");
  expect(invoke).toHaveBeenCalledTimes(1);
  finish(snapshot);
  expect(await sidebar).toEqual(snapshot);
  expect(await page).toEqual(snapshot);
  expect(await getProjectGitStatus("demo", "<workspace>/main")).toEqual(
    snapshot,
  );
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(peekProjectGitStatus("demo", "<workspace>/main")).toEqual(snapshot);
  expect(peekProjectGitStatus("demo", "<workspace>/other")).toBeUndefined();
  vi.mocked(invoke).mockResolvedValue(snapshot);
  vi.advanceTimersByTime(10000);
  await getProjectGitStatus("demo", "<workspace>/main");
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("invalidates cached snapshots on changes and never returns an in-flight result from before a save", async () => {
  let finish!: (value: GitStatus) => void;
  vi.mocked(invoke)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(snapshot);
  const pending = getProjectGitStatus("saved", "<workspace>/main");
  window.dispatchEvent(new Event("worktree-file-saved"));
  window.dispatchEvent(new Event("project-git-changed"));
  const fresh = getProjectGitStatus("saved", "<workspace>/main");
  expect(invoke).toHaveBeenCalledTimes(1);
  finish({ ...snapshot, branch: "outdated" });
  expect(await pending).toEqual(snapshot);
  expect(await fresh).toEqual(snapshot);
  expect(invoke).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new Event("focus"));
  await getProjectGitStatus("saved", "<workspace>/main");
  expect(invoke).toHaveBeenCalledTimes(3);
});

it("keeps checkouts separate and retries failed scans", async () => {
  vi.mocked(invoke)
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValue(snapshot);
  await expect(getProjectGitStatus("retry")).rejects.toThrow("Unavailable");
  await getProjectGitStatus("retry");
  await getProjectGitStatus("retry", "<workspace>/topic");
  expect(invoke).toHaveBeenCalledTimes(3);
});
