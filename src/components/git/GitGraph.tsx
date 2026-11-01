import { useState } from "react";
import { GitGraph as GraphIcon, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGitGraph } from "../../hooks/useGitGraph";
import { GitGraphTable } from "./GitGraphTable";
import { getErrorMessage } from "../../lib/error";
import {
  GitCommitDetails,
  type CommitFileSelection,
  type CommitTarget,
} from "./GitCommitDetails";
import { cn } from "../../utils";

/** Editor-sized repository graph; commit details reuse the sidebar inspection flow. */
export function GitGraph({
  target,
  revision,
  changedFiles,
  onSelect,
  onClose,
}: {
  target: CommitTarget;
  revision: number;
  changedFiles: number;
  onSelect: (selection: CommitFileSelection) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [remotes, setRemotes] = useState(true);
  const [limit, setLimit] = useState(200);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>();
  const result = useGitGraph(
    target.projectId,
    target.worktreePath,
    remotes,
    limit,
    revision + refresh,
  );
  const commits = result?.data?.commits;
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      aria-label={t("git.graph.title")}
    >
      <div className="flex h-9 shrink-0 items-center border-b border-border-subtle bg-bg-secondary">
        <span className="flex h-full items-center gap-2 border-r border-border-subtle border-t-2 border-t-accent bg-background px-3 text-xs">
          <GraphIcon size={14} className="text-accent-light" />
          {t("git.graph.title")}
          <button
            type="button"
            className="app-button-ghost h-5 w-5 p-0"
            onClick={onClose}
            aria-label={t("git.graph.close")}
            title={t("git.graph.close")}
          >
            <X size={12} />
          </button>
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border-subtle px-3 py-2 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={remotes}
            onChange={(event) => setRemotes(event.target.checked)}
          />
          {t("git.graph.remotes")}
        </label>
        <input
          type="search"
          className="min-w-32 flex-1 rounded border border-border bg-surface px-2 py-1 text-primary outline-none focus:border-accent"
          aria-label={t("git.filterCommits")}
          placeholder={t("git.filterCommitsHint")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="app-button-ghost h-6 w-6 p-0"
          disabled={!result || result.loading}
          onClick={() => setRefresh((value) => value + 1)}
          aria-label={t("settings.refresh")}
          title={t("settings.refresh")}
        >
          <RefreshCw
            size={14}
            className={cn((!result || result.loading) && "animate-spin")}
          />
        </button>
      </div>
      {!result ? (
        <p role="status" className="p-4 text-xs text-muted">
          {t("common.loading")}
        </p>
      ) : result.error && !result.data ? (
        <div role="alert" className="p-4 text-xs text-danger">
          {getErrorMessage(result.error, t("common.error"))}
          <button
            type="button"
            className="app-button-ghost ml-2 px-2"
            onClick={() => setRefresh((value) => value + 1)}
          >
            {t("common.retry")}
          </button>
        </div>
      ) : (
        <>
          {result.error && (
            <div role="alert" className="px-3 py-2 text-xs text-danger">
              {getErrorMessage(result.error, t("common.error"))}
              <button
                type="button"
                className="app-button-ghost ml-2 px-2"
                onClick={() => setRefresh((value) => value + 1)}
              >
                {t("common.retry")}
              </button>
            </div>
          )}
          <GitGraphTable
            key={JSON.stringify([
              target.projectId,
              target.worktreePath,
              remotes,
            ])}
            commits={commits ?? []}
            changedFiles={changedFiles}
            query={query}
            selected={selected}
            onSelect={setSelected}
            loading={result.loading}
          />
          <div className="flex shrink-0 items-center gap-3 border-t border-border-subtle px-3 py-1 text-xs text-muted">
            <span>
              {t("git.loadedCommitCount", { count: commits?.length ?? 0 })}
            </span>
            <span>{t("git.cachedRefs")}</span>
            {result.data?.has_more &&
              (limit < 5000 ? (
                <button
                  type="button"
                  className="app-button-ghost ml-auto px-2"
                  disabled={result.loading}
                  onClick={() =>
                    setLimit((value) => Math.min(value + 200, 5000))
                  }
                >
                  {t("git.graph.loadMore")}
                </button>
              ) : (
                <span>{t("git.graph.limit")}</span>
              ))}
          </div>
        </>
      )}
      {selected && (
        <div className="git-history max-h-[50%] shrink-0 overflow-auto border-t border-border-subtle bg-bg-secondary">
          <div className="flex items-center px-3 py-1 text-xs text-muted">
            <span className="font-mono">{selected.slice(0, 7)}</span>
            <button
              type="button"
              className="app-button-ghost ml-auto h-6 w-6 p-0"
              aria-label={t("common.close")}
              onClick={() => setSelected(undefined)}
            >
              <X size={12} />
            </button>
          </div>
          <GitCommitDetails
            key={selected}
            target={target}
            sha={selected}
            expanded
            onSelectParent={setSelected}
            onSelect={onSelect}
          />
        </div>
      )}
    </section>
  );
}
