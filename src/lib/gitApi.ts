import { invoke } from "@tauri-apps/api/core";
export type GitRepositoryAction =
  "fetch" | "pull" | "push" | "switch_branch" | "create_branch";
export async function runProjectGitAction(
  projectId: string,
  worktreePath: string | undefined,
  action: GitRepositoryAction,
  branch?: string,
) {
  await invoke<void>("run_project_git_action", {
    projectId,
    worktreePath,
    action,
    branch,
  });
  window.dispatchEvent(new Event("project-git-changed"));
  if (action !== "fetch" && action !== "push")
    window.dispatchEvent(new Event("worktree-file-saved"));
}
export interface GitFile {
  path: string;
  old_path?: string | null;
  staged: boolean;
  unstaged: boolean;
  conflicted: boolean;
  status: string;
  additions?: number | null;
  deletions?: number | null;
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

export const discardProjectGitChanges = async (
  projectId: string,
  worktreePath: string | undefined,
  paths: string[],
) => {
  await invoke<void>("discard_project_git_changes", {
    projectId,
    worktreePath,
    paths,
  });
  window.dispatchEvent(new Event("project-git-changed"));
  window.dispatchEvent(new Event("worktree-file-saved"));
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

export interface GitCommitDetails {
  sha: string;
  message: string;
  author: string;
  committer: string;
  author_email: string;
  committer_email: string;
  time: number;
  parents: string[];
  files: {
    path: string;
    old_path: string | null;
    status: string;
    additions?: number | null;
    deletions?: number | null;
  }[];
  additions: number;
  deletions: number;
  truncated: boolean;
}
export const getProjectGitCommit = (
  projectId: string,
  worktreePath: string | undefined,
  sha: string,
) =>
  invoke<GitCommitDetails>("get_project_git_commit", {
    projectId,
    worktreePath,
    sha,
  });
export const getProjectGitCommitDiff = (
  projectId: string,
  worktreePath: string | undefined,
  sha: string,
  path: string,
) =>
  invoke<string>("get_project_git_commit_diff", {
    projectId,
    worktreePath,
    sha,
    path,
  });

export type GitReferenceKind = "branches" | "remotes" | "stashes" | "tags";
export interface GitReferences {
  entries: {
    kind: GitReferenceKind;
    name: string;
    sha: string | null;
    summary?: string | null;
    time?: number | null;
  }[];
  truncated: boolean;
}
export const getProjectGitReferences = (
  projectId: string,
  worktreePath?: string,
) =>
  invoke<GitReferences>("get_project_git_references", {
    projectId,
    worktreePath,
  });

export interface GitHistoryPage {
  commits: GitStatus["commits"];
  has_more: boolean;
}
export const getProjectGitHistory = (
  projectId: string,
  worktreePath: string | undefined,
  sha: string,
  offset: number,
) =>
  invoke<GitHistoryPage>("get_project_git_history", {
    projectId,
    worktreePath,
    sha,
    offset,
  });

export interface GitGraphCommit {
  sha: string;
  summary: string;
  author: string;
  time: number;
  parents: string[];
  refs: {
    name: string;
    remote: boolean;
    kind?: "branch" | "remote" | "tag";
    remote_name?: string | null;
    current?: boolean;
  }[];
  head?: boolean;
}
export interface GitGraphData {
  commits: GitGraphCommit[];
  has_more: boolean;
}
export const getProjectGitGraph = (
  projectId: string,
  worktreePath: string | undefined,
  includeRemotes: boolean,
  limit: number,
) =>
  invoke<GitGraphData>("get_project_git_graph", {
    projectId,
    worktreePath,
    includeRemotes,
    limit,
  });
