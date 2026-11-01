import { useMemo, useState } from "react";
import { GitGraph as GraphIcon, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGitGraph } from "../../hooks/useGitGraph";
import { layoutGitGraph, type GraphRow } from "../../lib/gitGraph";
import { getErrorMessage } from "../../lib/error";
import { formatGitCommitTime } from "../../lib/gitTime";
import {
  GitCommitDetails,
  type CommitFileSelection,
  type CommitTarget,
} from "./GitCommitDetails";
import { cn } from "../../utils";

const colors = [
  "var(--color-accent)",
  "var(--color-brand-teal)",
  "var(--color-danger)",
  "var(--color-text-secondary)",
];
function GraphLines({ row, width }: { row: GraphRow; width: number }) {
  const x = (lane: number) => 12 + lane * 16;
  return (
    <svg width={width} height="30" aria-hidden="true" className="block">
      {row.edges.map((edge, index) => (
        <path
          key={index}
          d={
            edge.half === "top"
              ? `M ${x(edge.from)} 0 L ${x(edge.to)} 15`
              : `M ${x(edge.from)} 15 C ${x(edge.from)} 24 ${x(edge.to)} 22 ${x(edge.to)} 30`
          }
          stroke={colors[edge.color % colors.length]}
          strokeWidth="1.5"
          fill="none"
        />
      ))}
      <circle
        cx={x(row.lane)}
        cy="15"
        r="3.5"
        fill={colors[row.lane % colors.length]}
      />
    </svg>
  );
}

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
  const { t, i18n } = useTranslation();
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
  const graph = useMemo(() => layoutGitGraph(commits ?? []), [commits]);
  const width = Math.max(56, graph.width * 16 + 16);
  const needle = query.trim().toLocaleLowerCase();
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
          disabled={!result}
          onClick={() => setRefresh((value) => value + 1)}
          aria-label={t("settings.refresh")}
          title={t("settings.refresh")}
        >
          <RefreshCw size={14} className={cn(!result && "animate-spin")} />
        </button>
      </div>
      {!result ? (
        <p role="status" className="p-4 text-xs text-muted">
          {t("common.loading")}
        </p>
      ) : result.error ? (
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
          <div className="min-h-0 flex-1 overflow-auto">
            <table
              className="git-graph-table w-full table-fixed border-collapse text-xs"
              style={{ minWidth: 680 + width }}
            >
              <colgroup>
                <col style={{ width }} />
                <col />
                <col style={{ width: 155 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 85 }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-bg-secondary text-left text-muted">
                <tr>
                  <th>{t("git.graph.column")}</th>
                  <th>{t("git.commitMessage")}</th>
                  <th>{t("git.graph.date")}</th>
                  <th>{t("git.author")}</th>
                  <th>SHA</th>
                </tr>
              </thead>
              <tbody>
                {!!changedFiles && (
                  <tr className="text-muted">
                    <td>
                      <span className="block px-2">◯</span>
                    </td>
                    <td colSpan={4}>
                      {t("git.graph.uncommitted", { count: changedFiles })}
                    </td>
                  </tr>
                )}
                {commits?.map((commit, index) => {
                  const match =
                    !needle ||
                    `${commit.summary} ${commit.author} ${commit.sha} ${commit.refs.map((ref) => ref.name).join(" ")}`
                      .toLocaleLowerCase()
                      .includes(needle);
                  return (
                    <tr
                      key={commit.sha}
                      className={cn(
                        "hover:bg-surface-hover",
                        selected === commit.sha && "bg-surface-active",
                      )}
                    >
                      <td className="p-0">
                        <GraphLines row={graph.rows[index]} width={width} />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setSelected(commit.sha)}
                          aria-pressed={selected === commit.sha}
                          className={cn(
                            "flex h-[30px] w-full items-center gap-2 overflow-hidden text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                            !match && "opacity-30",
                          )}
                          title={commit.summary}
                        >
                          {commit.refs.map((ref) => (
                            <span
                              key={ref.name}
                              className="max-w-36 shrink-0 truncate rounded border border-accent-border bg-accent-bg px-1 text-accent-light"
                              title={ref.name}
                            >
                              {ref.name}
                            </span>
                          ))}
                          <span className="truncate">{commit.summary}</span>
                        </button>
                      </td>
                      <td
                        className="truncate text-muted"
                        title={formatGitCommitTime(
                          commit.time,
                          i18n.language,
                          true,
                        )}
                      >
                        {formatGitCommitTime(commit.time, i18n.language)}
                      </td>
                      <td className="truncate text-muted" title={commit.author}>
                        {commit.author}
                      </td>
                      <td className="font-mono text-muted" title={commit.sha}>
                        {commit.sha.slice(0, 7)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!commits?.length && (
              <p role="status" className="p-4 text-xs text-muted">
                {t("git.unborn")}
              </p>
            )}
          </div>
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
        <div className="git-history max-h-[40%] shrink-0 overflow-auto border-t border-border-subtle bg-bg-secondary">
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
            onSelect={onSelect}
          />
        </div>
      )}
    </section>
  );
}
