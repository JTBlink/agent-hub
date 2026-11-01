import { GitBranch, Tag } from "lucide-react";
import type { GitGraphCommit } from "../../lib/gitApi";
import {
  graphBadgeBackground,
  graphColor,
  groupGitGraphRefs,
} from "../../lib/gitGraphRefs";
import { cn } from "../../utils";

export function GitGraphRefBadges({
  refs,
  color,
}: {
  refs: GitGraphCommit["refs"];
  color: number;
}) {
  return groupGitGraphRefs(refs).map((badge) => {
    const Icon = badge.kind === "tag" ? Tag : GitBranch;
    return (
      <span
        key={`${badge.kind}:${badge.name}`}
        data-graph-ref={badge.kind}
        title={badge.fullNames.join("\n")}
        className="inline-flex shrink-0 items-stretch overflow-hidden rounded-sm border whitespace-nowrap"
        style={{
          borderColor: graphColor(color),
          background: graphBadgeBackground(graphColor(color)),
        }}
      >
        <span
          className="inline-flex items-center px-1"
          style={{ background: graphColor(color), color: "var(--color-bg)" }}
        >
          <Icon size={12} aria-hidden="true" />
        </span>
        <span
          className={cn("px-1.5", badge.current && "font-semibold")}
          style={{ color: graphColor(color) }}
        >
          {badge.name}
        </span>
        {badge.remotes.map((remote) => (
          <span
            key={remote}
            className="border-l px-1.5 italic text-secondary"
            style={{ borderColor: graphColor(color) }}
          >
            {remote}
          </span>
        ))}
      </span>
    );
  });
}
