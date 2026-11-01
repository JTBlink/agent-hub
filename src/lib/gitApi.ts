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
