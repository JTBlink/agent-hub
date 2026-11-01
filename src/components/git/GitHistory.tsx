import { useState } from "react";
import { ChevronRight, GitCommitHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitStatus } from "../../lib/gitApi";
import { cn } from "../../utils";

export function GitHistory({
  commits,
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  commits: GitStatus["commits"];
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const { t } = useTranslation();
  const [localExpanded, setLocalExpanded] = useState(true);
  const expanded = controlledExpanded ?? localExpanded;
  return (
    <section className="git-history flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          if (controlledExpanded === undefined) setLocalExpanded(!expanded);
          onExpandedChange?.(!expanded);
        }}
        className="flex w-full shrink-0 items-center gap-1 px-2 py-2 text-xs font-semibold text-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <ChevronRight size={13} className={cn(expanded && "rotate-90")} />
        {t("git.commits")}
        <span className="ml-auto font-mono font-normal text-muted">
          {commits.length}
        </span>
      </button>
      {expanded && (
        <ol className="min-h-0 flex-1 overflow-auto px-3 pb-3">
          {commits.map((commit, index) => (
            <li key={commit.sha} className="relative flex gap-2 pb-3 last:pb-0">
              {index < commits.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-1.5 top-4 border-l border-accent-border"
                />
              )}
              <GitCommitHorizontal
                size={14}
                className="relative mt-0.5 shrink-0 text-accent-light"
              />
              <div className="min-w-0 flex-1 text-xs">
                <p className="truncate text-secondary" title={commit.summary}>
                  {commit.summary}
                </p>
                <p className="flex min-w-0 items-center gap-2 text-muted">
                  <span
                    className="truncate"
                    title={`${commit.author} · ${new Date(commit.time * 1000).toLocaleString()}`}
                  >
                    {commit.author}
                  </span>
                  <span
                    className="ml-auto shrink-0 font-mono text-accent-light"
                    title={commit.sha}
                  >
                    {commit.sha.slice(0, 7)}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
