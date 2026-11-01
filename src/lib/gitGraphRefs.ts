import type { GitGraphCommit } from "./gitApi";

export interface GraphRefBadge {
  name: string;
  kind: "branch" | "remote" | "tag";
  remotes: string[];
  fullNames: string[];
  current: boolean;
}

/** Fold only remote branches that point to this same commit and match a local branch. */
export function groupGitGraphRefs(
  refs: GitGraphCommit["refs"],
): GraphRefBadge[] {
  const badges: GraphRefBadge[] = refs
    .filter((ref) => !ref.remote)
    .map((ref) => ({
      name: ref.name,
      kind: ref.kind === "tag" ? "tag" : "branch",
      remotes: [],
      fullNames: [ref.name],
      current: !!ref.current,
    }));
  for (const ref of refs.filter((ref) => ref.remote)) {
    const remote = ref.remote_name ?? ref.name.split("/")[0];
    const branch = ref.name.slice(remote.length + 1);
    const local = badges.find(
      (badge) =>
        badge.kind === "branch" && badge.name === branch && branch !== "HEAD",
    );
    if (local) {
      local.remotes.push(remote);
      local.fullNames.push(ref.name);
    } else {
      badges.push({
        name: ref.name,
        kind: "remote",
        remotes: [],
        fullNames: [ref.name],
        current: false,
      });
    }
  }
  return badges.sort((a, b) => Number(b.current) - Number(a.current));
}

export const GRAPH_COLORS = [
  "var(--terminal-blue)",
  "var(--terminal-magenta)",
  "var(--terminal-green)",
  "var(--terminal-yellow)",
  "var(--terminal-cyan)",
  "var(--terminal-red)",
];
export const graphColor = (color: number) =>
  color < 0
    ? "var(--color-text-muted)"
    : GRAPH_COLORS[color % GRAPH_COLORS.length];

export const graphBadgeBackground = (color: string) =>
  `color-mix(in srgb, ${color} 6%, var(--color-bg))`;
