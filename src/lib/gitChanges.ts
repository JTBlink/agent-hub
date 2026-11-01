import type { GitFile } from "./gitApi";

/** A file changed in both index and working tree appears in both change groups. */
export function groupGitChanges(files: GitFile[]) {
  const stagedFiles = files.filter((file) => file.staged);
  const unstagedFiles = files.filter(
    (file) => file.unstaged || file.conflicted,
  );
  return {
    stagedFiles,
    unstagedFiles,
    count: stagedFiles.length + unstagedFiles.length,
  };
}
