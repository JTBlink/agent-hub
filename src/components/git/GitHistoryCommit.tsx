import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronRight, GitCommitHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitStatus } from "../../lib/gitApi";
import { formatGitCommitTime } from "../../lib/gitTime";
import { cn } from "../../utils";
import {
  GitCommitDetails,
  type CommitTarget,
  type CommitFileSelection,
} from "./GitCommitDetails";
import { GitCommitHoverCard } from "./GitCommitHoverCard";

export function GitHistoryCommit({
  commit,
  branch,
  isHead,
  open,
  target,
  selected,
  onSelect,
  onExpandedChange,
}: {
  commit: GitStatus["commits"][number];
  branch: string;
  isHead: boolean;
  open: boolean;
  target?: CommitTarget;
  selected?: CommitFileSelection;
  onSelect?: (selection: CommitFileSelection) => void;
  onExpandedChange: (open: boolean) => void;
}) {
  const { i18n } = useTranslation();
  const [hover, setHover] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipId = useId();
  const overCard = useRef(false);
  const clearTimer = useCallback(() => {
    clearTimeout(timer.current);
  }, []);
  const show = () => {
    clearTimer();
    timer.current = setTimeout(() => setHover(true), 350);
  };
  const hide = () => {
    clearTimer();
    timer.current = setTimeout(() => setHover(false), 150);
  };
  const dismiss = useCallback(() => {
    clearTimer();
    setHover(false);
  }, [clearTimer]);
  useEffect(() => () => clearTimer(), [clearTimer]);
  useEffect(() => {
    if (!hover) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
      }
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [hover, dismiss]);
  const date = new Date(commit.time * 1000);
  const fullTime = formatGitCommitTime(commit.time, i18n?.language, true);
  return (
    <li className="git-history-row relative">
      <details
        open={open}
        className="git-history-commit group"
        onToggle={(event) => {
          if (event.target === event.currentTarget)
            onExpandedChange(event.currentTarget.open);
        }}
      >
        <summary
          ref={setAnchor}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={() => {
            if (!overCard.current) dismiss();
          }}
          onClick={dismiss}
          aria-describedby={hover && target ? tooltipId : undefined}
          className={cn(
            "git-history-summary flex min-w-0 cursor-pointer items-center gap-1.5 px-2 py-1 text-xs hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            selected?.sha === commit.sha && "bg-surface-active",
          )}
          title={
            target
              ? undefined
              : `${commit.summary}\n${commit.author} · ${fullTime}\n${commit.sha}`
          }
        >
          <ChevronRight
            size={12}
            aria-hidden="true"
            className="git-history-chevron shrink-0 text-muted"
          />
          <GitCommitHorizontal
            size={14}
            aria-hidden="true"
            className="shrink-0 text-accent-light"
          />
          {isHead && (
            <span
              className="max-w-[25%] truncate rounded bg-accent-bg px-1 text-accent-light"
              title={branch}
            >
              {branch}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-secondary">
            {commit.summary}
          </span>
          <span className="git-history-author max-w-24 truncate text-muted">
            {commit.author}
          </span>
          <time
            dateTime={date.toISOString()}
            className="shrink-0 text-muted"
            title={fullTime}
          >
            <span className="git-history-date">
              {date.toLocaleDateString(i18n?.language, {
                month: "short",
                day: "numeric",
              })}{" "}
            </span>
            {date.toLocaleTimeString(i18n?.language, {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </time>
        </summary>
        {target && onSelect && open && (
          <GitCommitDetails
            target={target}
            sha={commit.sha}
            selected={selected}
            onSelect={onSelect}
          />
        )}
        {(!target || !onSelect) && (
          <div className="select-text space-y-1 bg-surface px-3 py-2 pl-9 text-xs text-muted">
            <p className="break-all font-mono text-accent-light">
              {commit.sha}
            </p>
            <p>{fullTime}</p>
          </div>
        )}
      </details>
      {hover && target && anchor && (
        <GitCommitHoverCard
          commit={commit}
          target={target}
          anchor={anchor}
          id={tooltipId}
          onEnter={() => {
            overCard.current = true;
            clearTimer();
          }}
          onLeave={() => {
            overCard.current = false;
            hide();
          }}
        />
      )}
    </li>
  );
}
