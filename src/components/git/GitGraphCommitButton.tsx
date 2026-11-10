import { useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { GitGraphCommit } from "../../lib/gitApi";
import { truncateCommitSummary } from "../../lib/gitGraphText";
import { CardActionMenu } from "../CardActionMenu";
import { GitGraphRefBadges } from "./GitGraphRefBadges";
import { useGitCopyActions } from "./useGitCopyActions";

export function GitGraphCommitButton({
  commit,
  index,
  color,
  selected,
  onSelect,
  onKeyDown,
}: {
  commit: GitGraphCommit;
  index: number;
  color: number;
  selected: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useTranslation();
  const target = useRef<HTMLButtonElement>(null);
  const actions = useGitCopyActions([
    { key: "sha", label: t("git.copyCommitSha"), text: commit.sha },
    { key: "message", label: t("git.copyCommitSummary"), text: commit.summary },
  ]);
  return (
    <>
      <button
        ref={target}
        type="button"
        data-commit-index={index}
        onKeyDown={onKeyDown}
        onClick={onSelect}
        aria-pressed={selected}
        className="flex h-[30px] min-w-0 w-full items-center gap-1.5 overflow-hidden whitespace-nowrap text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        title={commit.summary}
      >
        {commit.refs.length > 0 && (
          <span className="git-graph-refs flex min-w-0 max-w-[60%] shrink-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <GitGraphRefBadges
              refs={commit.refs}
              color={color}
              sha={commit.sha}
              onDetails={onSelect}
            />
          </span>
        )}
        <span className="min-w-0 max-w-[32rem] flex-1 truncate">
          {truncateCommitSummary(commit.summary)}
        </span>
      </button>
      <CardActionMenu
        contextOnly
        contextTarget={target}
        label={t("git.referenceActions")}
        actions={[
          { key: "details", label: t("git.viewDetails"), onSelect },
          ...actions,
        ]}
      />
    </>
  );
}
