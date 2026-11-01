import { useTranslation } from "react-i18next";
import { useDisclosures } from "../../hooks/useDisclosures";
import { useGitHistoryPages } from "../../hooks/useGitHistoryPages";
import { GitHistoryCommit } from "./GitHistoryCommit";
import { GitHistoryPagination } from "./GitHistoryPagination";
import type { CommitFileSelection, CommitTarget } from "./GitCommitDetails";

export function GitTagHistory({
  target,
  sha,
  selected,
  onSelect,
}: {
  target: CommitTarget;
  sha: string;
  selected?: CommitFileSelection;
  onSelect?: (selection: CommitFileSelection) => void;
}) {
  const { t } = useTranslation();
  const { opened, setOpen } = useDisclosures();
  const history = useGitHistoryPages({
    projectId: target.projectId,
    worktreePath: target.worktreePath,
    sha,
  });
  return (
    <div
      className="ml-4 border-l border-border-subtle pb-1"
      aria-busy={history.loading}
    >
      <ol aria-label={t("git.tagHistoryHint")}>
        {history.commits.map((commit) => (
          <GitHistoryCommit
            key={commit.sha}
            commit={commit}
            isHead={false}
            branch=""
            open={opened.has(commit.sha)}
            target={target}
            selected={selected}
            onSelect={onSelect}
            onExpandedChange={(open) => setOpen(commit.sha, open)}
          />
        ))}
      </ol>
      <GitHistoryPagination
        loading={history.loading}
        exhausted={history.exhausted}
        error={history.error}
        hasMore={history.hasMore}
        onLoadMore={history.loadMore}
        onRetry={history.retry}
      />
      {!history.loading && !history.error && history.commits.length === 0 && (
        <p role="status" className="px-4 py-2 text-xs text-muted">
          {t("git.noBrowseResults")}
        </p>
      )}
    </div>
  );
}
