import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getAppScale } from "../../lib/textScale";
import { formatGitCommitTime } from "../../lib/gitTime";
import { useGitCommitDetails } from "../../hooks/useGitCommitDetails";
import type { GitStatus } from "../../lib/gitApi";
import type { CommitTarget } from "./GitCommitDetails";

export function GitCommitHoverCard({
  commit,
  target,
  anchor,
  id,
  onEnter,
  onLeave,
}: {
  commit: GitStatus["commits"][number];
  target: CommitTarget;
  anchor: HTMLElement;
  id: string;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { t, i18n } = useTranslation();
  const result = useGitCommitDetails(
    target.projectId,
    target.worktreePath,
    commit.sha,
  );
  const card = useRef<HTMLDivElement>(null);
  const contentId = useId();
  useLayoutEffect(() => {
    const locate = () => {
      const panel = card.current;
      if (!panel) return;
      const scale = getAppScale(),
        rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth / scale,
        viewportHeight = window.innerHeight / scale;
      const width = Math.min(480, viewportWidth - 16);
      panel.style.width = `${width}px`;
      panel.style.maxHeight = `${Math.max(80, Math.min(400, viewportHeight - 16))}px`;
      const height = panel.getBoundingClientRect().height / scale;
      const right = rect.right / scale + 8;
      const left =
        right + width <= viewportWidth - 8
          ? right
          : Math.max(8, rect.left / scale - width - 8);
      panel.style.left = `${Math.max(8, Math.min(left, viewportWidth - width - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(rect.top / scale, viewportHeight - height - 8))}px`;
    };
    locate();
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(locate);
    if (card.current) observer?.observe(card.current);
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [anchor]);
  const data = result?.data;
  return createPortal(
    <div
      ref={card}
      id={id}
      role="tooltip"
      aria-labelledby={contentId}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed z-[100] overflow-auto rounded-lg border border-border bg-surface p-3 text-xs text-secondary shadow-card-hover select-text"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border-subtle pb-2">
        <span className="font-medium text-primary">{commit.author}</span>
        <time
          dateTime={new Date(commit.time * 1000).toISOString()}
          className="text-muted"
        >
          {formatGitCommitTime(commit.time, i18n?.language, true)}
        </time>
      </p>
      <div className="flex flex-wrap items-center gap-2 py-2">
        <span className="font-mono text-accent-light" title={commit.sha}>
          {commit.sha.slice(0, 7)}
        </span>
        {data && (
          <>
            <span>
              {data.files.length}
              {data.truncated ? "+" : ""} {t("git.commitFiles")}
            </span>
            <span className="text-[var(--color-brand-teal)]">
              +{data.additions}
            </span>
            <span className="text-danger">−{data.deletions}</span>
          </>
        )}
      </div>
      <p
        id={contentId}
        className="whitespace-pre-wrap break-words leading-relaxed"
      >
        {data?.message ?? commit.summary}
      </p>
      {!result && <p className="mt-2 text-muted">{t("common.loading")}</p>}
      {result?.error != null && (
        <p className="mt-2 text-danger">{t("git.hoverDetailsFailed")}</p>
      )}
    </div>,
    document.body,
  );
}
