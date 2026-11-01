import { invoke } from "@tauri-apps/api/core";
export interface WorktreeSearchOptions {
  query: string;
  case_sensitive: boolean;
  whole_word: boolean;
  regex: boolean;
  include: string;
  exclude: string;
  use_ignore: boolean;
}
export interface WorktreeSearchMatch {
  line: number;
  column: number;
  end_column: number;
  preview: string;
  preview_start: number;
}
export interface WorktreeSearchFile {
  path: string;
  fingerprint: string;
  matches: WorktreeSearchMatch[];
}
export interface WorktreeSearchResult {
  files: WorktreeSearchFile[];
  count: number;
  truncated: boolean;
  skipped: number;
}
export interface WorktreeReplaceResult {
  replaced: number;
  files: number;
  errors: string[];
}
export const searchWorktree = (
  projectId: string,
  worktreePath: string,
  options: WorktreeSearchOptions,
) =>
  invoke<WorktreeSearchResult>("search_worktree", {
    projectId,
    worktreePath,
    options,
  });
export const replaceWorktreeMatches = (
  projectId: string,
  worktreePath: string,
  options: WorktreeSearchOptions,
  replacement: string,
  files: WorktreeSearchFile[],
) =>
  invoke<WorktreeReplaceResult>("replace_worktree_matches", {
    projectId,
    worktreePath,
    options,
    replacement,
    files,
  });
