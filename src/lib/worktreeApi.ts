import { invoke } from "@tauri-apps/api/core";

export interface ProjectWorktree {
  path: string;
  branch: string | null;
  head: string | null;
  is_main: boolean;
  locked: boolean;
  available: boolean;
}
export interface WorktreeFileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
}
export const getProjectWorktrees = (projectId: string) =>
  invoke<ProjectWorktree[]>("get_project_worktrees", { projectId });
export const getWorktreeFiles = (
  projectId: string,
  worktreePath: string,
  relativePath = "",
) =>
  invoke<WorktreeFileEntry[]>("get_worktree_files", {
    projectId,
    worktreePath,
    relativePath,
  });
export const readWorktreeFile = (
  projectId: string,
  worktreePath: string,
  relativePath: string,
) =>
  invoke<string>("read_worktree_file", {
    projectId,
    worktreePath,
    relativePath,
  });

export function worktreeDirectoryName(path: string) {
  return (
    path
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .at(-1) || path
  );
}

export function worktreeLabel(worktree: ProjectWorktree) {
  const directory = worktreeDirectoryName(worktree.path);
  const branch =
    worktree.branch ??
    worktree.head?.slice(0, 8) ??
    worktree.path.split(/[\\/]/).filter(Boolean).at(-1) ??
    worktree.path;
  return branch === directory ? directory : `${directory} · ${branch}`;
}

export const writeWorktreeFile = (
  projectId: string,
  worktreePath: string,
  relativePath: string,
  expectedContent: string,
  content: string,
) =>
  invoke<void>("write_worktree_file", {
    projectId,
    worktreePath,
    relativePath,
    expectedContent,
    content,
  });

export function projectWorkspaceRoute(pathname: string, search: string) {
  return /^\/project\/[^/]+$/.test(pathname)
    ? projectCheckoutRoute(pathname, search)
    : null;
}

/** Project pages that retain the checkout file explorer. */
export function projectCheckoutRoute(pathname: string, search: string) {
  const match = /^\/project\/([^/]+)(?:\/skills)?$/.exec(pathname);
  return match
    ? {
        projectId: decodeURIComponent(match[1]),
        worktreePath: new URLSearchParams(search).get("worktree") ?? undefined,
      }
    : null;
}
export function worktreeUrl(projectId: string, path?: string) {
  return `/project/${encodeURIComponent(projectId)}${path ? `?${new URLSearchParams({ worktree: path })}` : ""}`;
}

export const createProjectWorktree = (
  projectId: string,
  sourcePath: string,
  branch: string,
  destination: string,
) =>
  invoke<ProjectWorktree>("create_project_worktree", {
    projectId,
    sourcePath,
    branch,
    destination,
  });
