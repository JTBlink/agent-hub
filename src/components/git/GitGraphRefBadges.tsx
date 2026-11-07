import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { CardActionMenu } from "../CardActionMenu";
import { useGitCopyActions } from "./useGitCopyActions";
import { GitBranch, Tag, Cloud } from "lucide-react";
import type { GitGraphCommit } from "../../lib/gitApi";
import {
  graphBadgeBackground,
  graphColor,
  groupGitGraphRefs,
  type GraphRefBadge,
} from "../../lib/gitGraphRefs";
import { cn } from "../../utils";
import { GitTagMenu } from "./GitTagMenu";

export function GitGraphRefBadges({
  refs,
  color,
  sha,
  onDetails,
}: {
  refs: GitGraphCommit["refs"];
  color: number;
  sha: string;
  onDetails: () => void;
}) {
  return groupGitGraphRefs(refs).map((badge) => (
    <GitGraphRefBadge
      key={`${badge.kind}:${badge.name}`}
      badge={badge}
      color={color}
      sha={sha}
      onDetails={onDetails}
    />
  ));
}

function GitGraphRefBadge({
  badge,
  color,
  sha,
  onDetails,
}: {
  badge: GraphRefBadge;
  color: number;
  sha: string;
  onDetails: () => void;
}) {
  const { t } = useTranslation();
  const target = useRef<HTMLSpanElement>(null);
  const Icon =
    badge.kind === "tag" ? Tag : badge.kind === "remote" ? Cloud : GitBranch;
  const branchKind = t(
    badge.kind === "tag"
      ? "git.browse.tags"
      : badge.kind === "remote"
        ? "git.graph.remoteBranch"
        : "git.graph.localBranch",
  );
  const actions = useGitCopyActions(
    badge.kind === "tag"
      ? []
      : [
          ...badge.fullNames.map((name) => ({
            key: name,
            label:
              t("git.copyBranchName") +
              (badge.fullNames.length > 1 ? `: ${name}` : ""),
            text: name,
          })),
          { key: "sha", label: t("git.copyCommitSha"), text: sha },
        ],
  );
  return (
    <>
      <span
        ref={target}
        tabIndex={0}
        data-graph-ref={badge.kind}
        title={`${branchKind}: ${badge.fullNames.join("\n")}`}
        aria-label={`${branchKind}: ${badge.fullNames.join(", ")}`}
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
            className="inline-flex items-center gap-1 border-l px-1.5 italic text-secondary"
            title={`${t("git.graph.remoteBranch")}: ${remote}/${badge.name}`}
            style={{ borderColor: graphColor(color) }}
          >
            <Cloud size={11} aria-hidden="true" />
            {remote}
          </span>
        ))}
      </span>
      {badge.kind === "tag" ? (
        <GitTagMenu
          contextOnly
          contextTarget={target}
          name={badge.name}
          sha={sha}
          onDetails={onDetails}
        />
      ) : (
        <CardActionMenu
          contextOnly
          contextTarget={target}
          label={t("git.referenceActions")}
          actions={[
            {
              key: "details",
              label: t("git.viewDetails"),
              onSelect: onDetails,
            },
            ...actions,
          ]}
        />
      )}
    </>
  );
}
