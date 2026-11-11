import { GitGraphBranchFilter } from "./GitGraphBranchFilter";
import {
  graphBranchOptions,
  graphBranchHistory,
} from "../../lib/gitGraphBranches";
import { useContext, useState } from "react";
import { GitGraph as GraphIcon, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGitGraph } from "../../hooks/useGitGraph";
import { GitGraphTable } from "./GitGraphTable";
import { getErrorMessage } from "../../lib/error";
import {
  GitCommitDetails,
  type CommitFileSelection,
  type CommitTarget,
} from "./GitCommitDetails";
import { GitGraphToolbar } from "./GitGraphToolbar";
import { GitEditorTabsContext } from "../../hooks/gitEditorVisibility";
import { GitEditorTab } from "./GitEditorTab";

/** Editor-sized repository graph; commit details reuse the sidebar inspection flow. */
export function GitGraph({
  target,
  focusCommit,
  revision,
  changedFiles,
  onSelect,
  onClose,
  busy,
  fetching,
  onFetch,
  onRefresh,
}: {
  target: CommitTarget;
  focusCommit?: { sha: string };
  revision: number;
  changedFiles: number;
  onSelect: (selection: CommitFileSelection) => void;
  onClose: () => void;
  busy: boolean;
  fetching: boolean;
  onFetch: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const sharedTabs = useContext(GitEditorTabsContext);
  const [branchFilter, setBranchFilter] = useState("");
  const [remotes, setRemotes] = useState(true);
  const [limit, setLimit] = useState(200);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | undefined>(
    focusCommit?.sha,
  );
  const [previousFocus, setPreviousFocus] = useState(focusCommit);
  if (previousFocus !== focusCommit) {
    setPreviousFocus(focusCommit);
    setSelected(focusCommit?.sha);
    setQuery("");
    setBranchFilter("");
  }
  const result = useGitGraph(
    target.projectId,
    target.worktreePath,
    remotes,
    limit,
    revision + refresh,
  );
  const commits = result?.data?.commits;
  const branchOption = graphBranchOptions(commits ?? []).find(
    (option) => option.value === branchFilter,
  );
  const visibleCommits = graphBranchHistory(commits ?? [], branchOption?.sha);
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      aria-label={t("git.graph.title")}
    >
      <GitEditorTab
        label={t("git.graph.title")}
        icon={<GraphIcon size={14} className="shrink-0 text-accent-light" />}
        closeLabel={t("git.graph.close")}
        onClose={onClose}
      />
      <GitGraphToolbar
        branchControl={
          <GitGraphBranchFilter
            commits={commits ?? []}
            value={branchOption ? branchFilter : ""}
            onChange={setBranchFilter}
          />
        }
        remotes={remotes}
        onRemotes={(next) => {
          setRemotes(next);
          if (!next && branchOption?.remote) setBranchFilter("");
        }}
        query={query}
        onQuery={setQuery}
        limit={limit}
        onLimit={setLimit}
        loading={!result || result.loading}
        busy={busy}
        fetching={fetching}
        onTerminal={sharedTabs?.onTerminal}
        onFetch={onFetch}
        onRefresh={onRefresh}
      />
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
          {focusCommit &&
            focusCommit.sha === selected &&
            !commits?.some((commit) => commit.sha === selected) && (
              <p role="status" className="px-3 py-2 text-xs text-muted">
                {t("git.tagActions.outsideGraph")}
              </p>
            )}
          <GitGraphTable
            key={JSON.stringify([
              target.projectId,
              target.worktreePath,
              remotes,
            ])}
            commits={visibleCommits}
            changedFiles={
              visibleCommits.some((commit) => commit.head) ? changedFiles : 0
            }
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
