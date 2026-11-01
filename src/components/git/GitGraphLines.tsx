import type { GraphRow } from "../../lib/gitGraph";
import { graphColor } from "../../lib/gitGraphRefs";
export function GitGraphLines({
  row,
  width,
  head = false,
}: {
  row: GraphRow;
  width: number;
  head?: boolean;
}) {
  const x = (lane: number) => 12 + lane * 16;
  return (
    <svg width={width} height="30" aria-hidden="true" className="block">
      {row.edges.map((edge, index) => (
        <path
          key={index}
          d={
            edge.from === edge.to
              ? `M ${x(edge.from)} ${edge.half === "top" ? 0 : 15} V ${edge.half === "top" ? 15 : 30}`
              : edge.half === "top"
                ? `M ${x(edge.from)} 0 C ${x(edge.from)} 15 ${x(edge.to)} 0 ${x(edge.to)} 15`
                : `M ${x(edge.from)} 15 C ${x(edge.from)} 30 ${x(edge.to)} 15 ${x(edge.to)} 30`
          }
          stroke={graphColor(edge.color)}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
      <circle
        cx={x(row.lane)}
        cy="15"
        r="3.5"
        fill={head ? "var(--color-bg)" : graphColor(row.color)}
        stroke={graphColor(row.color)}
        strokeWidth={head ? 2 : 1}
      />
    </svg>
  );
}

export function GitGraphWorkingLine({
  width,
  connected,
}: {
  width: number;
  connected: boolean;
}) {
  return (
    <svg width={width} height="30" aria-hidden="true" className="block">
      {connected && (
        <path
          d="M 12 15 V 30"
          stroke={graphColor(-1)}
          strokeWidth="1.5"
          fill="none"
        />
      )}
      <circle
        cx="12"
        cy="15"
        r="4"
        fill="var(--color-bg)"
        stroke={graphColor(-1)}
        strokeWidth="1.5"
      />
    </svg>
  );
}
