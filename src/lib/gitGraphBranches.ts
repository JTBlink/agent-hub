import type { GitGraphCommit } from "./gitApi";

export function graphBranchOptions(commits: GitGraphCommit[]) {
  return commits
    .flatMap((commit) =>
      commit.refs
        .filter((ref) => ref.kind !== "tag")
        .map((ref) => ({
          value: JSON.stringify([ref.remote, ref.name]),
          name: ref.name,
          remote: ref.remote,
          sha: commit.sha,
        })),
    )
    .sort(
      (a, b) =>
        Number(a.remote) - Number(b.remote) || a.name.localeCompare(b.name),
    );
}

/** Keep every loaded ancestor, including both sides of merges. */
export function graphBranchHistory(commits: GitGraphCommit[], sha?: string) {
  if (!sha) return commits;
  const bySha = new Map(commits.map((commit) => [commit.sha, commit]));
  const reachable = new Set<string>();
  const pending = [sha];
  while (pending.length) {
    const current = pending.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    pending.push(...(bySha.get(current)?.parents ?? []));
  }
  return commits.filter((commit) => reachable.has(commit.sha));
}
