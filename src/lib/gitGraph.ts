import type { GitGraphCommit } from "./gitApi";

export interface GraphEdge {
  from: number;
  to: number;
  half: "top" | "bottom";
  color: number;
}
export interface GraphRow {
  lane: number;
  edges: GraphEdge[];
}
/** Keep pending parents in stable lanes so merges connect to their actual SHA. */
export function layoutGitGraph(commits: GitGraphCommit[]) {
  const lanes: (string | null)[] = [];
  let width = 1;
  const rows: GraphRow[] = commits.map((commit) => {
    const before = [...lanes];
    let lane = lanes.indexOf(commit.sha);
    if (lane < 0) {
      lane = lanes.indexOf(null);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = commit.sha;
    }
    lanes[lane] = null;
    const parents = commit.parents.map((sha, index) => {
      let target = lanes.indexOf(sha);
      if (target < 0) {
        target =
          index === 0 && lanes[lane] === null ? lane : lanes.indexOf(null);
        if (target < 0) target = lanes.length;
        lanes[target] = sha;
      }
      return target;
    });
    const edges: GraphEdge[] = [];
    before.forEach((sha, index) => {
      if (!sha) return;
      edges.push({ from: index, to: index, half: "top", color: index });
      if (sha !== commit.sha)
        edges.push({ from: index, to: index, half: "bottom", color: index });
    });
    parents.forEach((target) =>
      edges.push({ from: lane, to: target, half: "bottom", color: target }),
    );
    width = Math.max(width, lanes.length);
    return { lane, edges };
  });
  return { rows, width };
}
