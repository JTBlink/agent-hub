// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  gitBackupFileDiff,
  gitBackupStatus,
  type GitBackupChange,
  type GitBackupFileDiff,
  type GitBackupStatus,
} from "../lib/tauri";
import BackupDiff from "./BackupDiff";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../lib/tauri", () => ({
  gitBackupStatus: vi.fn(),
  gitBackupFileDiff: vi.fn(),
}));

const change = {
  path: "skills/demo/SKILL.md",
  previous_path: null,
  kind: "modified",
} as const;
const otherChange = { ...change, path: "skills/other/SKILL.md" };
const loadedDiff: GitBackupFileDiff = {
  path: change.path,
  status: "modified",
  content_kind: "text",
  original_text: "old content",
  updated_text: "new content",
};
function statusWith(changes: GitBackupChange[]): GitBackupStatus {
  return {
    is_repo: true,
    remote_url: null,
    branch: "main",
    has_changes: changes.length > 0,
    changed_skill_count: changes.length,
    changes,
    ahead: 0,
    behind: 0,
    last_commit: null,
    last_commit_time: null,
    current_snapshot_tag: null,
    restored_from_tag: null,
    upstream_health: "no_remote",
  };
}
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(gitBackupFileDiff).mockResolvedValue(loadedDiff);
  vi.mocked(gitBackupStatus).mockResolvedValue(
    statusWith([change, otherChange]),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(
  changes: GitBackupChange[] | null = [change, otherChange],
) {
  await act(async () => {
    root.render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/backup/diff",
            state: { changes: changes ?? undefined },
          },
        ]}
      >
        <BackupDiff />
      </MemoryRouter>,
    );
  });
}

it("keeps the loaded diff visible when selecting the current file again", async () => {
  await render();
  expect(container.textContent).toContain("new content");
  const file = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("SKILL.md"),
  );
  expect(file).toBeDefined();
  await act(async () => file?.click());
  expect(container.textContent).not.toMatch(/Loading/);
  expect(container.textContent).toContain("new content");
  expect(gitBackupFileDiff).toHaveBeenCalledTimes(1);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function selectSkill(index: number) {
  const files = Array.from(container.querySelectorAll("button")).filter(
    (button) => button.textContent?.includes("SKILL.md"),
  );
  await act(async () => files[index].click());
}

it("finishes loading after repeatedly selecting a file while its request is pending", async () => {
  const request = deferred<GitBackupFileDiff>();
  vi.mocked(gitBackupFileDiff).mockReturnValue(request.promise);
  await render();
  await selectSkill(0);
  await selectSkill(0);
  await act(async () => request.resolve(loadedDiff));
  expect(container.textContent).not.toMatch(/Loading/);
  expect(container.textContent).toContain("new content");
  expect(gitBackupFileDiff).toHaveBeenCalledTimes(1);
});

it("keeps the selected file result when an older request finishes later", async () => {
  const first = deferred<GitBackupFileDiff>();
  const second = deferred<GitBackupFileDiff>();
  vi.mocked(gitBackupFileDiff)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  await render();
  await selectSkill(1);
  await act(async () =>
    second.resolve({
      ...loadedDiff,
      path: otherChange.path,
      updated_text: "other content",
    }),
  );
  await act(async () => first.resolve(loadedDiff));
  expect(container.textContent).not.toMatch(/Loading/);
  expect(container.textContent).toContain("other content");
  expect(container.textContent).not.toContain("new content");
});

it("shows a failed read without returning to loading when the same file is selected", async () => {
  vi.mocked(gitBackupFileDiff).mockRejectedValue(
    new Error("Cannot read backup file"),
  );
  await render();
  expect(container.textContent).toContain("Cannot read backup file");
  await selectSkill(0);
  expect(container.textContent).not.toMatch(/Loading/);
  expect(container.textContent).toContain("Cannot read backup file");
});

function refreshButton() {
  const button = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "backup.changes.refresh",
  );
  if (!button) throw new Error("Refresh button missing");
  return button;
}

async function refresh() {
  await act(async () => refreshButton().click());
}

it("refreshes the change list, count and content of the selected file", async () => {
  await render();
  const added = {
    ...change,
    path: "skills/added/README.md",
    kind: "added",
  } as const;
  vi.mocked(gitBackupStatus).mockResolvedValue(
    statusWith([change, otherChange, added]),
  );
  vi.mocked(gitBackupFileDiff).mockResolvedValue({
    ...loadedDiff,
    updated_text: "latest content",
  });
  await refresh();
  expect(container.textContent).toContain("README.md");
  expect(container.querySelector("header")?.textContent).toContain("3");
  expect(container.textContent).toContain("latest content");
  expect(container.textContent).not.toContain("new content");
  expect(gitBackupFileDiff).toHaveBeenLastCalledWith(change.path);
  expect(gitBackupFileDiff).toHaveBeenCalledTimes(2);
});

it("preserves a selected file after the list order changes", async () => {
  await render();
  await selectSkill(1);
  vi.mocked(gitBackupStatus).mockResolvedValue(
    statusWith([otherChange, change]),
  );
  await refresh();
  expect(gitBackupFileDiff).toHaveBeenLastCalledWith(otherChange.path);
});

it("selects a remaining file when the current file no longer has changes", async () => {
  await render();
  vi.mocked(gitBackupStatus).mockResolvedValue(statusWith([otherChange]));
  vi.mocked(gitBackupFileDiff).mockResolvedValue({
    ...loadedDiff,
    path: otherChange.path,
    updated_text: "remaining content",
  });
  await refresh();
  expect(gitBackupFileDiff).toHaveBeenLastCalledWith(otherChange.path);
  expect(container.textContent).toContain("remaining content");
});

it("clears resolved changes and can discover new changes from an empty list", async () => {
  await render();
  vi.mocked(gitBackupStatus).mockResolvedValue(statusWith([]));
  await refresh();
  expect(container.textContent).toContain("backup.changes.noContent");
  expect(container.textContent).not.toContain("new content");
  expect(gitBackupFileDiff).toHaveBeenCalledTimes(1);
  vi.mocked(gitBackupStatus).mockResolvedValue(statusWith([otherChange]));
  vi.mocked(gitBackupFileDiff).mockResolvedValue({
    ...loadedDiff,
    path: otherChange.path,
    updated_text: "discovered content",
  });
  await refresh();
  expect(container.textContent).toContain("discovered content");
  expect(gitBackupFileDiff).toHaveBeenLastCalledWith(otherChange.path);
});

it("disables duplicate refreshes until both the status and diff requests finish", async () => {
  await render();
  const status = deferred<GitBackupStatus>();
  const diff = deferred<GitBackupFileDiff>();
  vi.mocked(gitBackupStatus).mockReturnValue(status.promise);
  vi.mocked(gitBackupFileDiff).mockReturnValue(diff.promise);
  await refresh();
  expect(refreshButton().disabled).toBe(true);
  expect(refreshButton().getAttribute("aria-busy")).toBe("true");
  await refresh();
  expect(gitBackupStatus).toHaveBeenCalledTimes(1);
  await act(async () => status.resolve(statusWith([change])));
  expect(refreshButton().disabled).toBe(true);
  await act(async () =>
    diff.resolve({ ...loadedDiff, updated_text: "refreshed content" }),
  );
  expect(refreshButton().disabled).toBe(false);
  expect(container.textContent).toContain("refreshed content");
});

it("preserves loaded content after a status failure and allows a retry", async () => {
  await render();
  vi.mocked(gitBackupStatus).mockRejectedValueOnce(
    new Error("Cannot refresh changes"),
  );
  await refresh();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Cannot refresh changes",
  );
  expect(container.textContent).toContain("new content");
  expect(refreshButton().disabled).toBe(false);
  await refresh();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(gitBackupFileDiff).toHaveBeenCalledTimes(2);
});

it("retries a failed file read when refreshing the same path", async () => {
  vi.mocked(gitBackupFileDiff).mockRejectedValueOnce(
    new Error("Cannot read file"),
  );
  await render();
  expect(container.textContent).toContain("Cannot read file");
  await refresh();
  expect(container.textContent).not.toContain("Cannot read file");
  expect(container.textContent).toContain("new content");
  expect(refreshButton().disabled).toBe(false);
});

it("keeps the latest selection when it changes while refreshing the list", async () => {
  await render();
  const status = deferred<GitBackupStatus>();
  const outdated = deferred<GitBackupFileDiff>();
  vi.mocked(gitBackupStatus).mockReturnValue(status.promise);
  await refresh();
  vi.mocked(gitBackupFileDiff).mockReturnValueOnce(outdated.promise);
  await selectSkill(1);
  vi.mocked(gitBackupFileDiff).mockResolvedValue({
    ...loadedDiff,
    path: otherChange.path,
    updated_text: "latest selected content",
  });
  await act(async () => status.resolve(statusWith([change, otherChange])));
  await act(async () =>
    outdated.resolve({
      ...loadedDiff,
      path: otherChange.path,
      updated_text: "outdated content",
    }),
  );
  expect(gitBackupFileDiff).toHaveBeenLastCalledWith(otherChange.path);
  expect(container.textContent).toContain("latest selected content");
  expect(container.textContent).not.toContain("outdated content");
});

it("allows retrying an initial status failure when opened without a change list", async () => {
  vi.mocked(gitBackupStatus).mockRejectedValueOnce(
    new Error("Cannot load changes"),
  );
  await render(null);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Cannot load changes",
  );
  expect(refreshButton().disabled).toBe(false);
  await refresh();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("new content");
  expect(gitBackupFileDiff).toHaveBeenCalledWith(change.path);
});
