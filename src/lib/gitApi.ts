import { invoke } from "@tauri-apps/api/core";
export interface GitFile {
  path: string;
  staged: boolean;
  unstaged: boolean;
  conflicted: boolean;
  status: string;
}
export interface GitStatus {
  branch: string | null;
  head: string | null;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  state: string;
  files: GitFile[];
  commits: { sha: string; summary: string; author: string; time: number }[];
  truncated: boolean;
}
export const getProjectGitStatus = (projectId: string, worktreePath?: string) =>
  invoke<GitStatus>("get_project_git_status", { projectId, worktreePath });
export const getProjectGitDiff = (
  projectId: string,
  worktreePath: string | undefined,
  path: string,
  staged: boolean,
) =>
  invoke<string>("get_project_git_diff", {
    projectId,
    worktreePath,
    path,
    staged,
  });
export const setProjectGitStaged = async (
  projectId: string,
  worktreePath: string | undefined,
  paths: string[],
  staged: boolean,
) => {
  await invoke<void>("set_project_git_staged", {
    projectId,
    worktreePath,
    paths,
    staged,
  });
  window.dispatchEvent(new Event("project-git-changed"));
};

export const commitProjectGit = async (
  projectId: string,
  worktreePath: string | undefined,
  message: string,
) => {
  await invoke<void>("commit_project_git", {
    projectId,
    worktreePath,
    message,
  });
  window.dispatchEvent(new Event("project-git-changed"));
};
