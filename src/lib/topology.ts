export interface TopologyConnection {
  path: string;
  pulseX: number;
  pulseY: number;
  startY: number;
}

export interface TopologyLayout {
  connections: TopologyConnection[];
  gap: number;
  height: number;
  nodeHeight: number;
}

function formatCoordinate(value: number) {
  return Number(value.toFixed(2));
}

export function createTopologyLayout(agentCount: number): TopologyLayout {
  const count = Math.max(0, Math.floor(agentCount));
  const nodeHeight = count <= 3 ? 50 : 44;
  const gap = count <= 3 ? 14 : 8;
  const groupHeight = count
    ? count * nodeHeight + Math.max(0, count - 1) * gap
    : 0;
  const height = Math.max(198, groupHeight + 20);
  const groupTop = (height - groupHeight) / 2;
  const hubY = height / 2 - 15;

  const connections = Array.from({ length: count }, (_, index) => {
    const startY = groupTop + nodeHeight / 2 + index * (nodeHeight + gap);
    const arcOffset =
      count <= 1 ? 0 : (index / Math.max(1, count - 1) - 0.5) * 22;
    const pulseX = 63.5 + Math.abs(arcOffset) / 11;
    const pulseY = hubY + arcOffset;
    const controlEndX = 56;

    return {
      startY: formatCoordinate(startY),
      pulseX: formatCoordinate(pulseX),
      pulseY: formatCoordinate(pulseY),
      path: `M35 ${formatCoordinate(startY)} C47 ${formatCoordinate(startY)} ${controlEndX} ${formatCoordinate(pulseY)} ${formatCoordinate(pulseX)} ${formatCoordinate(pulseY)}`,
    };
  });

  return { connections, gap, height, nodeHeight };
}
