import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { GitGraphCommit } from "../../lib/gitApi";
import { layoutGitGraph } from "../../lib/gitGraph";
import { formatGitCommitTime } from "../../lib/gitTime";
import { cn } from "../../utils";
import { GitGraphLines, GitGraphWorkingLine } from "./GitGraphLines";
import { GitGraphRefBadges } from "./GitGraphRefBadges";
import { GRAPH_ROW_HEIGHT, useGitGraphViewport } from "./useGitGraphViewport";

/** Presentation boundary: accepts repository data and emits a SHA, never performs IPC. */
export function GitGraphTable({
  commits,
  changedFiles,
  query,
  selected,
  onSelect,
  loading,
}: {
  commits: GitGraphCommit[];
  changedFiles: number;
  query: string;
  selected?: string;
  onSelect: (sha: string) => void;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const workingHead = changedFiles
    ? commits.find((commit) => commit.head)?.sha
    : undefined;
  const graph = useMemo(
    () => layoutGitGraph(commits, workingHead),
    [commits, workingHead],
  );
  const width = Math.max(56, graph.width * 16 + 16);
  const {
    ref: viewportRef,
    start,
    end,
    reveal,
  } = useGitGraphViewport(commits.length, changedFiles ? 1 : 0);
  const table = useRef<HTMLTableElement>(null);
  const [focus, setFocus] = useState<{ index: number }>();
  const needle = query.trim().toLocaleLowerCase();
  useLayoutEffect(() => {
    if (focus)
      table.current
        ?.querySelector<HTMLButtonElement>(
          `[data-commit-index="${focus.index}"]`,
        )
        ?.focus({ preventScroll: true });
  }, [focus]);
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target =
      event.key === "ArrowDown"
        ? Math.min(commits.length - 1, index + 1)
        : event.key === "ArrowUp"
          ? Math.max(0, index - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? commits.length - 1
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    reveal(target);
    setFocus({ index: target });
  };
  return (
    <div
      ref={viewportRef}
      className="min-h-0 flex-1 overflow-auto"
      aria-busy={loading}
    >
      <table
        ref={table}
        aria-rowcount={commits.length + 1 + (changedFiles ? 1 : 0)}
        className="git-graph-table w-full border-collapse text-xs"
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
          <tr aria-rowindex={1}>
            <th>{t("git.graph.column")}</th>
            <th>{t("git.commitMessage")}</th>
            <th>{t("git.graph.date")}</th>
            <th>{t("git.author")}</th>
            <th>SHA</th>
          </tr>
        </thead>
        <tbody>
          {!!changedFiles && (
            <tr className="text-muted" aria-rowindex={2}>
              <td className="p-0">
                <GitGraphWorkingLine width={width} connected={!!workingHead} />
              </td>
              <td colSpan={4}>
                {t("git.graph.uncommitted", { count: changedFiles })}
              </td>
            </tr>
          )}
          <Spacer height={start * GRAPH_ROW_HEIGHT} />
          {commits.slice(start, end).map((commit, offset) => {
            const index = start + offset;
            const match =
              !needle ||
              `${commit.summary} ${commit.author} ${commit.sha} ${commit.refs.map((ref) => ref.name).join(" ")}`
                .toLocaleLowerCase()
                .includes(needle);
            return (
              <tr
                key={commit.sha}
                aria-rowindex={index + 2 + (changedFiles ? 1 : 0)}
                className={cn(
                  "hover:bg-surface-hover",
                  selected === commit.sha && "bg-surface-active",
                )}
              >
                <td className="p-0">
                  <GitGraphLines
                    row={graph.rows[index]}
                    width={width}
                    head={commit.head}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    data-commit-index={index}
                    onKeyDown={(event) => navigate(event, index)}
                    onClick={() => onSelect(commit.sha)}
                    aria-pressed={selected === commit.sha}
                    className={cn(
                      "flex h-[30px] w-full items-center gap-1.5 whitespace-nowrap text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                      !match && "opacity-30",
                    )}
                    title={commit.summary}
                  >
                    <GitGraphRefBadges
                      refs={commit.refs}
                      color={graph.rows[index].color}
                    />
                    <span className="min-w-24 flex-1 truncate">
                      {commit.summary}
                    </span>
                  </button>
                </td>
                <td
                  className="truncate text-muted"
                  title={formatGitCommitTime(commit.time, i18n.language, true)}
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
          <Spacer height={(commits.length - end) * GRAPH_ROW_HEIGHT} />
        </tbody>
      </table>
      {!commits.length && (
        <p role="status" className="p-4 text-xs text-muted">
          {t("git.unborn")}
        </p>
      )}
    </div>
  );
}

function Spacer({ height }: { height: number }) {
  return height > 0 ? (
    <tr aria-hidden="true">
      <td colSpan={5} style={{ height, padding: 0 }} />
    </tr>
  ) : null;
}
