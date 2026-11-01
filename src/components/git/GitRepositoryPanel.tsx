import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getProjectGitReferences,
  type GitReferences,
  type GitStatus,
} from "../../lib/gitApi";
import { useDisclosures } from "../../hooks/useDisclosures";
import { getErrorMessage } from "../../lib/error";
import {
  GitCommitDetails,
  type CommitFileSelection,
  type CommitTarget,
} from "./GitCommitDetails";
import { GitTagHistory } from "./GitTagHistory";
import type { GitBrowseView } from "./GitHistoryToolbar";

export function GitRepositoryPanel({
  view,
  target,
  revision,
  collapseRevision,
  query,
  commits,
  selected,
  onSelect,
  onAuthor,
}: {
  view: Exclude<GitBrowseView, "commits">;
  target: CommitTarget;
  revision: number;
  collapseRevision: number;
  query: string;
  commits: GitStatus["commits"];
  selected?: CommitFileSelection;
  onSelect?: (selection: CommitFileSelection) => void;
  onAuthor: (author: string) => void;
}) {
  const { t } = useTranslation();
  const { opened, setOpen } = useDisclosures(collapseRevision);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([
    target.projectId,
    target.worktreePath,
    revision,
    retry,
  ]);
  const [response, setResponse] = useState<{
    key: string;
    data?: GitReferences;
    error?: string;
  }>();
  useEffect(() => {
    if (view === "contributors") return;
    let cancelled = false;
    void getProjectGitReferences(target.projectId, target.worktreePath).then(
      (data) => {
        if (!cancelled) setResponse({ key, data });
      },
      (cause) => {
        if (!cancelled)
          setResponse({
            key,
            error: getErrorMessage(cause, t("common.error")),
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [target.projectId, target.worktreePath, key, view, t]);
  const result = response?.key === key ? response : undefined;
  const needle = query.trim().toLocaleLowerCase();
  if (view === "contributors") {
    const counts = new Map<string, number>();
    for (const commit of commits)
      counts.set(commit.author, (counts.get(commit.author) ?? 0) + 1);
    const authors = [...counts.entries()]
      .filter(([name]) => name.toLocaleLowerCase().includes(needle))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return (
      <div className="pb-2 text-xs">
        <p className="px-3 py-2 text-muted">
          {t("git.recentContributors", { count: commits.length })}
        </p>
        {authors.map(([name, count]) => (
          <button
            key={name}
            type="button"
            onClick={() => onAuthor(name)}
            className="flex w-full min-w-0 items-center gap-2 px-3 py-1 text-left text-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            title={name}
          >
            <span className="min-w-0 flex-1 truncate">
              {name || t("git.unknownAuthor")}
            </span>
            <span className="font-mono text-muted">{count}</span>
          </button>
        ))}
        {!authors.length && (
          <p role="status" className="px-3 py-2 text-muted">
            {t("git.noBrowseResults")}
          </p>
        )}
      </div>
    );
  }
  if (!result)
    return (
      <p role="status" className="px-3 py-2 text-xs text-muted">
        {t("common.loading")}
      </p>
    );
  if (!result.data)
    return (
      <div role="alert" className="px-3 py-2 text-xs text-danger">
        <p>{result.error}</p>
        <button
          type="button"
          className="app-button-ghost mt-1 px-2"
          onClick={() => setRetry((value) => value + 1)}
        >
          {t("common.retry")}
        </button>
      </div>
    );
  const entries = result.data.entries.filter(
    (entry) =>
      entry.kind === view &&
      `${entry.name} ${entry.summary ?? ""} ${entry.sha ?? ""}`
        .toLocaleLowerCase()
        .includes(needle),
  );
  return (
    <div className="pb-2 text-xs">
      <p className="px-3 py-1 text-muted" title={t("git.cachedRefs")}>
        {t(`git.browse.${view}`)} ({entries.length})
      </p>
      {entries.map((entry) => (
        <details
          key={`${entry.kind}:${entry.name}`}
          open={opened.has(entry.name)}
          onToggle={(event) => {
            if (event.target !== event.currentTarget) return;
            const open = event.currentTarget.open;
            setOpen(entry.name, open);
          }}
        >
          <summary
            className="git-history-summary flex min-w-0 cursor-pointer items-center gap-1.5 px-2 py-1 text-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            title={entry.name}
          >
            <ChevronRight
              size={12}
              className="git-history-chevron shrink-0 text-muted"
            />
            <span
              className={
                view === "tags"
                  ? "max-w-[40%] shrink-0 truncate font-medium"
                  : "min-w-0 flex-1 truncate"
              }
            >
              {entry.name}
            </span>
            {view === "tags" ? (
              <span
                className="min-w-0 flex-1 truncate text-muted"
                title={entry.summary ?? undefined}
              >
                {entry.summary}
              </span>
            ) : (
              <span className="shrink-0 font-mono text-muted">
                {entry.sha?.slice(0, 7)}
              </span>
            )}
          </summary>
          {entry.sha && onSelect ? (
            opened.has(entry.name) &&
            (view === "tags" ? (
              <GitTagHistory
                key={entry.sha}
                target={target}
                sha={entry.sha}
                selected={selected}
                onSelect={onSelect}
              />
            ) : (
              <GitCommitDetails
                key={entry.sha}
                target={target}
                sha={entry.sha}
                selected={selected}
                onSelect={onSelect}
              />
            ))
          ) : (
            <p className="px-6 py-2 text-muted">{t("git.noReferenceCommit")}</p>
          )}
        </details>
      ))}
      {!entries.length && (
        <p role="status" className="px-3 py-2 text-muted">
          {t("git.noBrowseResults")}
        </p>
      )}
      {result.data.truncated && (
        <p className="px-3 py-2 text-muted">{t("git.referencesTruncated")}</p>
      )}
    </div>
  );
}
