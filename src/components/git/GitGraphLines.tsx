import type { GraphRow } from "../../lib/gitGraph";

const colors = [
  "var(--color-accent)",
  "var(--color-brand-teal)",
  "var(--color-danger)",
  "var(--color-text-secondary)",
];
export function GitGraphLines({
  row,
  width,
}: {
  row: GraphRow;
  width: number;
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
          stroke={colors[edge.color % colors.length]}
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
        fill={colors[row.lane % colors.length]}
      />
    </svg>
  );
}
