// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../lib/tauri";
import {
  createGitRepository,
  type GitRepositoryLibrary,
} from "../lib/gitRepositories";
import { useGitRepositories } from "./useGitRepositories";

vi.mock("../lib/tauri", () => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  previewGitInstall: vi.fn(),
  previewLocalGitRepository: vi.fn(),
  confirmGitInstall: vi.fn(),
  cancelGitPreview: vi.fn(),
  cancelInstall: vi.fn(),
  installLocalGitSkill: vi.fn(),
  clearGitRepositoryCache: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const skill = {
  rel_path: "demo",
  repo_path: "skills/demo",
  name: "Demo",
  description: null,
};
const first = {
  ...createGitRepository("https://git.example.invalid/team/first.git"),
  skills: [skill],
  refreshedAt: 1,
};
const second = {
  ...createGitRepository("ssh://git@git.example.invalid:11022/team/second.git"),
  skills: [skill],
  refreshedAt: 1,
};
const local = {
  ...createGitRepository("/projects/skills", "Local", "local"),
  skills: [skill],
  refreshedAt: 1,
};
const changed = vi.fn<() => Promise<void>>();
let controller: ReturnType<typeof useGitRepositories>;
let root: Root;
let container: HTMLDivElement;
function Harness() {
  const browser = useGitRepositories(changed);
  useEffect(() => {
    controller = browser;
  }, [browser]);
  return null;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function render(
  library: GitRepositoryLibrary = {
    repositories: [first, second, local],
    activeId: first.id,
  },
) {
  vi.mocked(api.getSettings).mockResolvedValue(JSON.stringify(library));
  await act(async () => root.render(<Harness />));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.mocked(api.getSettings).mockReset();
  vi.mocked(api.setSettings).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.previewGitInstall)
    .mockReset()
    .mockResolvedValue({ temp_dir: "<temp>/fresh", skills: [skill] });
  vi.mocked(api.previewLocalGitRepository)
    .mockReset()
    .mockResolvedValue({ path: local.url, skills: [skill] });
  vi.mocked(api.confirmGitInstall).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.cancelGitPreview).mockResolvedValue(undefined);
  vi.mocked(api.cancelInstall).mockResolvedValue(true);
  vi.mocked(api.installLocalGitSkill).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.clearGitRepositoryCache)
    .mockReset()
    .mockResolvedValue(undefined);
  changed.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("restores a cached multi-repository catalog without cloning and saves the selected repository", async () => {
  await render();
  expect(controller.repositories).toHaveLength(3);
  expect(api.previewGitInstall).not.toHaveBeenCalled();
  await act(async () => controller.select(second.id));
  expect(controller.activeId).toBe(second.id);
  expect(
    JSON.parse(vi.mocked(api.setSettings).mock.lastCall![1]).activeId,
  ).toBe(second.id);
});

it("keeps overlapping refreshes scoped to the originating repository", async () => {
  await render();
  const pending = deferred<api.GitPreviewResult>();
  vi.mocked(api.previewGitInstall).mockReturnValueOnce(pending.promise);
  let refresh!: Promise<void>;
  await act(async () => {
    refresh = controller.refresh(first.id);
    controller.select(second.id);
  });
  await act(async () => controller.refresh(second.id));
  await act(async () => {
    pending.resolve({
      temp_dir: "<temp>/first",
      skills: [{ ...skill, name: "First only" }],
    });
    await refresh;
  });
  expect(controller.activeId).toBe(second.id);
  expect(controller.repositories[0].skills[0].name).toBe("First only");
  expect(controller.repositories[1].skills[0].name).toBe("Demo");
  expect(api.cancelGitPreview).toHaveBeenCalledWith("<temp>/first");
});

it("keeps cached cards after refresh failure and clears the error on retry", async () => {
  await render();
  vi.mocked(api.previewGitInstall).mockRejectedValueOnce(new Error("Offline"));
  await act(async () => controller.refresh(first.id));
  expect(controller.repositories[0].skills).toEqual([skill]);
  expect(controller.errors[first.id]).toBe("Offline");
  await act(async () => controller.refresh(first.id));
  expect(controller.errors[first.id]).toBeUndefined();
});

it("installs against a fresh checkout and remaps scan-relative keys by repository path", async () => {
  await render();
  vi.mocked(api.previewGitInstall).mockResolvedValue({
    temp_dir: "<temp>/new",
    skills: [{ ...skill, rel_path: "skills/demo" }],
  });
  await act(async () => {
    expect(await controller.install(first.id, [skill])).toBe(true);
  });
  expect(api.confirmGitInstall).toHaveBeenCalledWith(first.url, "<temp>/new", [
    { rel_path: "skills/demo", name: "Demo" },
  ]);
  expect(changed).toHaveBeenCalledOnce();
  expect(controller.repositories[0].skills).toHaveLength(1);
});

it("rejects disappeared skills before installing and refreshes the displayed catalog", async () => {
  await render();
  vi.mocked(api.previewGitInstall).mockResolvedValue({
    temp_dir: "<temp>/new",
    skills: [],
  });
  await act(async () => {
    expect(await controller.install(first.id, [skill])).toBe(false);
  });
  expect(api.confirmGitInstall).not.toHaveBeenCalled();
  expect(controller.repositories[0].skills).toEqual([]);
  expect(api.cancelGitPreview).toHaveBeenCalledWith("<temp>/new");
});

it("retries failed imports with a new checkout and reconciles partial success", async () => {
  await render();
  vi.mocked(api.confirmGitInstall).mockRejectedValueOnce(
    new Error("Import failed"),
  );
  await act(async () => {
    expect(await controller.install(first.id, [skill])).toBe(false);
  });
  vi.mocked(api.previewGitInstall).mockResolvedValueOnce({
    temp_dir: "<temp>/retry",
    skills: [skill],
  });
  await act(async () => {
    expect(await controller.install(first.id, [skill])).toBe(true);
  });
  expect(api.confirmGitInstall).toHaveBeenLastCalledWith(
    first.url,
    "<temp>/retry",
    [{ rel_path: skill.rel_path, name: skill.name }],
  );
  expect(changed).toHaveBeenCalledTimes(2);
});

it("adds a canonical local working tree and imports locally without remote cloning", async () => {
  await render({ repositories: [], activeId: null });
  await act(async () => {
    expect(
      await controller.add("/projects/skills", "Local", "local"),
    ).toBeNull();
  });
  expect(controller.repositories[0].kind).toBe("local");
  await act(async () => {
    expect(await controller.install(local.id, [skill])).toBe(true);
  });
  expect(api.installLocalGitSkill).toHaveBeenCalledWith(
    local.url,
    skill.repo_path,
    skill.name,
    undefined,
  );
  expect(api.previewGitInstall).not.toHaveBeenCalled();
  expect(api.confirmGitInstall).not.toHaveBeenCalled();
});

it("passes a confirmed overwrite target through both remote and local installation", async () => {
  await render();
  const selection = { ...skill, overwrite_skill_id: "installed-id" };
  await act(async () => {
    expect(await controller.install(first.id, [selection])).toBe(true);
  });
  expect(api.confirmGitInstall).toHaveBeenCalledWith(
    first.url,
    "<temp>/fresh",
    [
      {
        rel_path: skill.rel_path,
        name: skill.name,
        overwrite_skill_id: "installed-id",
      },
    ],
  );
  await act(async () => {
    expect(await controller.install(local.id, [selection])).toBe(true);
  });
  expect(api.installLocalGitSkill).toHaveBeenCalledWith(
    local.url,
    skill.repo_path,
    skill.name,
    "installed-id",
  );
});

it("refuses two repository versions targeting the same installed Skill before fetching", async () => {
  await render();
  const selections = [
    { ...skill, overwrite_skill_id: "same-id" },
    { ...skill, repo_path: "other/demo", overwrite_skill_id: "same-id" },
  ];
  await act(async () => {
    expect(await controller.install(first.id, selections)).toBe(false);
  });
  expect(api.previewGitInstall).not.toHaveBeenCalled();
  expect(api.confirmGitInstall).not.toHaveBeenCalled();
});

it("clears only the chosen remote catalog and refuses to clear a local repository", async () => {
  await render();
  await act(async () => {
    expect(await controller.clearCache(first.id)).toBe(true);
  });
  expect(api.clearGitRepositoryCache).toHaveBeenCalledExactlyOnceWith(
    first.url,
  );
  expect(controller.repositories[0].skills).toEqual([]);
  expect(controller.repositories[0].refreshedAt).toBeNull();
  expect(controller.repositories[1].skills).toEqual([skill]);
  expect(controller.repositories).toHaveLength(3);
  await act(async () => {
    expect(await controller.clearCache(local.id)).toBe(false);
  });
  expect(api.clearGitRepositoryCache).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalled();
});

it("preserves the catalog when cleanup fails and supports retry", async () => {
  await render();
  vi.mocked(api.clearGitRepositoryCache).mockRejectedValueOnce(
    new Error("Cache busy"),
  );
  await act(async () => {
    expect(await controller.clearCache(first.id)).toBe(false);
  });
  expect(controller.repositories[0].skills).toEqual([skill]);
  expect(controller.errors[first.id]).toBe("Cache busy");
  await act(async () => {
    expect(await controller.clearCache(first.id)).toBe(true);
  });
});

it("never overwrites corrupt settings and serializes later selection saves", async () => {
  vi.mocked(api.getSettings).mockResolvedValue("broken");
  await act(async () => root.render(<Harness />));
  expect(controller.ready).toBe(false);
  expect(controller.loadError).toBeTruthy();
  expect(api.setSettings).not.toHaveBeenCalled();
  vi.mocked(api.getSettings).mockResolvedValue(
    JSON.stringify({ repositories: [first, second], activeId: first.id }),
  );
  await act(async () => controller.load());
  const pending = deferred<void>();
  vi.mocked(api.setSettings).mockReturnValueOnce(pending.promise);
  await act(async () => {
    controller.select(second.id);
    controller.select(first.id);
  });
  expect(api.setSettings).toHaveBeenCalledOnce();
  await act(async () => {
    pending.resolve();
    await pending.promise;
  });
  expect(
    JSON.parse(vi.mocked(api.setSettings).mock.lastCall![1]).activeId,
  ).toBe(first.id);
});

it("cleans up a delayed clone after unmount instead of saving a stale response", async () => {
  await render();
  const pending = deferred<api.GitPreviewResult>();
  vi.mocked(api.previewGitInstall).mockReturnValueOnce(pending.promise);
  let refresh!: Promise<void>;
  await act(async () => {
    refresh = controller.refresh(first.id);
  });
  await act(async () => root.unmount());
  pending.resolve({ temp_dir: "<temp>/late", skills: [skill] });
  await refresh;
  expect(api.cancelInstall).toHaveBeenCalledWith(first.url);
  expect(api.cancelGitPreview).toHaveBeenCalledWith("<temp>/late");
  expect(api.setSettings).not.toHaveBeenCalled();
});
