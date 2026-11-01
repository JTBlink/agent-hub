import { useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  GitBranch,
  Search,
  RefreshCw,
  ChevronsDownUp,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitStatus } from "../../lib/gitApi";
import {
  type CommitTarget,
  type CommitFileSelection,
} from "./GitCommitDetails";
import { GitHistoryToolbar, type GitBrowseView } from "./GitHistoryToolbar";
import { GitRepositoryPanel } from "./GitRepositoryPanel";
import { useDisclosures } from "../../hooks/useDisclosures";
import { useGitHistoryPages } from "../../hooks/useGitHistoryPages";
import { GitHistoryPagination } from "./GitHistoryPagination";
import { GitHistoryCommit } from "./GitHistoryCommit";
import { cn } from "../../utils";

export function GitHistory({
  status,
  loading,
  target,
  selected,
  onSelect,
  onRefresh,
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  status?: GitStatus;
  loading: boolean;
  onRefresh?: () => void;
  target?: CommitTarget;
  selected?: CommitFileSelection;
  onSelect?: (selection: CommitFileSelection) => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const { t } = useTranslation();
  const [localExpanded, setLocalExpanded] = useState(true);
  const expanded = controlledExpanded ?? localExpanded;
  const contentId = useId();
  const filterButton = useRef<HTMLButtonElement>(null);
  const {
    opened: openCommits,
    setOpen: setCommitOpen,
    collapseAll: collapseCommits,
  } = useDisclosures();
  const [filterVisible, setFilterVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<GitBrowseView>("commits");
  const [browseRevision, setBrowseRevision] = useState(0);
  const [collapseRevision, setCollapseRevision] = useState(0);
  const history = useGitHistoryPages({
    projectId: target?.projectId,
    worktreePath: target?.worktreePath,
    sha: status?.head ?? undefined,
    initial: status?.commits ?? [],
    enabled: expanded && view === "commits",
  });
  const allCommits = history.commits;
  const needle = query.trim().toLocaleLowerCase();
  const commits = allCommits.filter((commit) =>
    `${commit.summary} ${commit.author} ${commit.sha}`
      .toLocaleLowerCase()
      .includes(needle),
  );
  const branch = status?.branch ?? status?.head?.slice(0, 7) ?? t("git.unborn");
  const compared =
    !!status?.upstream && status.ahead !== null && status.behind !== null;
  return (
    <section
      className="git-history flex min-h-0 flex-1 flex-col"
      aria-label={t("git.commits")}
    >
      <div className="flex shrink-0 flex-wrap items-center">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => {
            if (controlledExpanded === undefined) setLocalExpanded(!expanded);
            onExpandedChange?.(!expanded);
          }}
          className="flex min-w-32 flex-1 items-center gap-1.5 px-2 py-2 text-xs font-semibold text-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ChevronRight
            size={13}
            className={cn("shrink-0", expanded && "rotate-90")}
          />
          <span className="truncate">
            {view === "commits" ? t("git.commits") : t(`git.browse.${view}`)}
          </span>
          {view === "commits" && (
            <span
              className="ml-auto rounded bg-surface px-1.5 font-mono font-normal text-muted"
              title={
                needle
                  ? t("git.filteredCommitCount", {
                      count: commits.length,
                      total: allCommits.length,
                    })
                  : t("git.loadedCommitCount", { count: allCommits.length })
              }
              aria-label={
                needle
                  ? t("git.filteredCommitCount", {
                      count: commits.length,
                      total: allCommits.length,
                    })
                  : t("git.loadedCommitCount", { count: allCommits.length })
              }
            >
              {needle
                ? `${commits.length} / ${allCommits.length}`
                : commits.length}
            </span>
          )}
        </button>
        {expanded && (
          <div className="ml-auto flex max-w-full flex-wrap items-center pr-1">
            <GitHistoryToolbar
              view={view}
              enabled={!!target}
              onChange={(next) => {
                setView(next);
                setQuery("");
              }}
            />
            <button
              type="button"
              className="app-button-ghost h-6 w-6 p-0"
              data-history-filter
              ref={filterButton}
              aria-label={
                view === "commits"
                  ? t("git.filterCommits")
                  : t("git.filterReferences")
              }
              title={
                view === "commits"
                  ? t("git.filterCommits")
                  : t("git.filterReferences")
              }
              aria-pressed={filterVisible}
              onClick={() => {
                setFilterVisible(!filterVisible);
                setQuery("");
              }}
            >
              <Search size={13} />
            </button>
            <button
              type="button"
              className="app-button-ghost h-6 w-6 p-0"
              aria-label={
                view === "commits"
                  ? t("git.collapseCommits")
                  : t("git.collapseReferences")
              }
              title={
                view === "commits"
                  ? t("git.collapseCommits")
                  : t("git.collapseReferences")
              }
              disabled={
                view === "contributors" ||
                (view === "commits" && !openCommits.size)
              }
              onClick={() => {
                collapseCommits();
                setCollapseRevision((value) => value + 1);
              }}
            >
              <ChevronsDownUp size={13} />
            </button>
            {onRefresh && (
              <button
                type="button"
                className="app-button-ghost h-6 w-6 p-0"
                aria-label={t("settings.refresh")}
                title={t("settings.refresh")}
                disabled={loading}
                onClick={() => {
                  setBrowseRevision((value) => value + 1);
                  onRefresh();
                }}
              >
                <RefreshCw
                  size={13}
                  className={cn(loading && "animate-spin")}
                />
              </button>
            )}
          </div>
        )}
      </div>
      {expanded && filterVisible && (
        <div className="relative mx-3 mb-2 shrink-0">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                setFilterVisible(false);
                filterButton.current?.focus();
              }
            }}
            className="w-full rounded border border-border bg-surface px-2 py-1 pr-6 text-xs text-primary outline-none focus:border-accent"
            aria-label={
              view === "commits"
                ? t("git.filterCommits")
                : t("git.filterReferences")
            }
            placeholder={
              view === "commits"
                ? t("git.filterCommitsHint")
                : t("git.filterReferences")
            }
          />
          {query && (
            <button
              type="button"
              aria-label={t("common.clear")}
              className="app-button-ghost absolute right-0.5 top-0.5 h-6 w-6 p-0"
              onClick={() => setQuery("")}
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}
      {expanded && (
        <div
          id={contentId}
          className="min-h-0 overflow-auto"
          aria-busy={loading}
        >
          {status && view === "commits" && (
            <div className="mx-3 mb-1 space-y-1 border-b border-border-subtle pb-1.5 text-xs">
              <div
                className="flex min-w-0 items-center gap-2 text-secondary"
                title={branch}
              >
                <GitBranch size={13} className="shrink-0 text-accent-light" />
                <span className="truncate font-medium">{branch}</span>
                {status.head && (
                  <span
                    className="ml-auto shrink-0 font-mono text-muted"
                    title={status.head}
                  >
                    {status.head.slice(0, 7)}
                  </span>
                )}
              </div>
              <div
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted"
                aria-label={t("git.cachedRefs")}
                title={t("git.cachedRefs")}
              >
                {status.upstream ? (
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={`${status.upstream} · ${t("git.cachedRefs")}`}
                  >
                    {status.upstream}
                  </span>
                ) : (
                  <span>{t("git.noUpstream")}</span>
                )}
                {compared && (
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    {status.ahead === 0 && status.behind === 0 ? (
                      <span className="flex items-center gap-1">
                        <Check size={12} />
                        {t("git.refsMatch")}
                      </span>
                    ) : (
                      <>
                        <span
                          className="flex items-center gap-0.5"
                          aria-label={t("git.aheadCount", {
                            count: status.ahead ?? undefined,
                          })}
                        >
                          <ArrowUp size={12} />
                          {status.ahead}
                        </span>
                        <span
                          className="flex items-center gap-0.5"
                          aria-label={t("git.behindCount", {
                            count: status.behind ?? undefined,
                          })}
                        >
                          <ArrowDown size={12} />
                          {status.behind}
                        </span>
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
          )}
          {view !== "commits" && target ? (
            <GitRepositoryPanel
              key={`${target.projectId}:${target.worktreePath}:${view}`}
              target={target}
              view={view}
              revision={browseRevision}
              collapseRevision={collapseRevision}
              query={query}
              commits={allCommits}
              selected={selected}
              onSelect={onSelect}
              onAuthor={(author) => {
                setView("commits");
                setQuery(author);
                setFilterVisible(true);
              }}
            />
          ) : commits.length === 0 ? (
            <p role="status" className="px-3 pb-3 text-xs text-muted">
              {needle
                ? t("git.noMatchingCommits")
                : loading
                  ? t("common.loading")
                  : status
                    ? t("git.unborn")
                    : t("git.historyUnavailable")}
            </p>
          ) : (
            <ol className="pb-2">
              {commits.map((commit) => (
                <GitHistoryCommit
                  key={commit.sha}
                  commit={commit}
                  branch={branch}
                  isHead={commit.sha === status?.head}
                  open={openCommits.has(commit.sha)}
                  target={target}
                  selected={selected}
                  onSelect={onSelect}
                  onExpandedChange={(open) => setCommitOpen(commit.sha, open)}
                />
              ))}
            </ol>
          )}
          {view === "commits" && (
            <GitHistoryPagination
              loading={history.loading}
              exhausted={history.exhausted}
              error={history.error}
              hasMore={history.hasMore}
              onLoadMore={history.loadMore}
              onRetry={history.retry}
            />
          )}
        </div>
      )}
    </section>
  );
}
