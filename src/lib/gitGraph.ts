/** Layout consumes only commit topology; it has no dependency on IPC or React. */
export interface GraphNode {
  sha: string;
  parents: readonly string[];
}

export interface GraphEdge {
  from: number;
  to: number;
  half: "top" | "bottom";
  color: number;
}
export interface GraphRow {
  lane: number;
  color: number;
  edges: GraphEdge[];
}
/** Keep parent lanes stable and give independent branches their own persistent color. */
export function layoutGitGraph(
  commits: readonly GraphNode[],
  workingHead?: string,
) {
  const lanes: (string | null)[] = workingHead ? [workingHead] : [];
  const colors: number[] = workingHead ? [0] : [];
  let nextColor = workingHead ? 1 : 0;
  let pendingWorking = !!workingHead;
  let width = 1;
  const rows: GraphRow[] = commits.map((commit) => {
    const before = [...lanes];
    const beforeColors = [...colors];
    let lane = lanes.indexOf(commit.sha);
    if (lane < 0) {
      lane = lanes.indexOf(null);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = commit.sha;
      colors[lane] = nextColor++;
    }
    const color = colors[lane];
    const incomingWorking = pendingWorking;
    if (commit.sha === workingHead) pendingWorking = false;
    // Keep separate branch lanes until their shared parent is actually rendered.
    // A parent can therefore be pending in several lanes that join on this row.
    lanes.forEach((sha, index) => {
      if (sha === commit.sha) lanes[index] = null;
    });
    const parents = commit.parents.map((sha, index) => {
      let target =
        index === 0 && lanes[lane] === null ? lane : lanes.indexOf(sha);
      const existing = target >= 0 && lanes[target] !== null;
      if (target < 0) {
        target = lanes.indexOf(null);
        if (target < 0) target = lanes.length;
      }
      if (!existing) {
        lanes[target] = sha;
        colors[target] = index === 0 ? color : nextColor++;
      }
      return target;
    });
    const edges: GraphEdge[] = [];
    before.forEach((sha, index) => {
      if (!sha) return;
      const edgeColor =
        incomingWorking && index === 0 && sha === workingHead
          ? -1
          : beforeColors[index];
      edges.push({
        from: index,
        to: sha === commit.sha ? lane : index,
        half: "top",
        color: edgeColor,
      });
      if (sha !== commit.sha)
        edges.push({
          from: index,
          to: index,
          half: "bottom",
          color: edgeColor,
        });
    });
    parents.forEach((target, index) =>
      edges.push({
        from: lane,
        to: target,
        half: "bottom",
        color: index === 0 ? color : colors[target],
      }),
    );
    width = Math.max(width, lanes.length);
    return { lane, color, edges };
  });
  return { rows, width };
}
