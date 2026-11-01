import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGitCommitDetails } from "../../hooks/useGitCommitDetails";
import { formatGitCommitTime } from "../../lib/gitTime";
import { getErrorMessage } from "../../lib/error";
import { GitChangeFiles } from "./GitChanges";

export interface CommitTarget {
  projectId: string;
  worktreePath?: string;
}
export interface CommitFileSelection {
  sha: string;
  path: string;
}

export function GitCommitDetails({
  target,
  sha,
  selected,
  onSelect,
}: {
  target: CommitTarget;
  sha: string;
  selected?: CommitFileSelection;
  onSelect: (selection: CommitFileSelection) => void;
}) {
  const { t, i18n } = useTranslation();
  const [revision, setRevision] = useState(0);
  const result = useGitCommitDetails(
    target.projectId,
    target.worktreePath,
    sha,
    revision,
  );
  if (!result)
    return (
      <p role="status" className="px-9 py-2 text-xs text-muted">
        {t("common.loading")}
      </p>
    );
  if (!result.data)
    return (
      <div role="alert" className="px-9 py-2 text-xs text-danger">
        <p>{getErrorMessage(result.error, t("common.error"))}</p>
        <button
          className="app-button-ghost mt-1 px-2"
          onClick={() => setRevision((value) => value + 1)}
        >
          {t("common.retry")}
        </button>
      </div>
    );
  const data = result.data;
  return (
    <div className="ml-[20px] border-l border-border-subtle pb-1">
      <details className="text-xs text-muted">
        <summary className="git-history-summary flex min-w-0 cursor-pointer items-center gap-1 px-2 py-1 text-xs hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <ChevronRight
            size={12}
            aria-hidden="true"
            className="git-history-chevron shrink-0"
          />
          {t("git.commitDetails")} · {data.files.length}
          {data.truncated ? "+" : ""} {t("git.commitFiles")}{" "}
          <span className="text-[var(--color-brand-teal)]">
            +{data.additions}
          </span>{" "}
          <span className="text-danger">−{data.deletions}</span>
        </summary>
        <dl className="space-y-1.5 bg-surface px-3 py-2">
          <dt>{t("git.commitMessage")}</dt>
          <dd className="whitespace-pre-wrap break-words text-secondary">
            {data.message}
          </dd>
          <dt>SHA</dt>
          <dd className="select-text break-all font-mono text-accent-light">
            {data.sha}
          </dd>
          <dt>{t("git.author")}</dt>
          <dd className="break-words">{data.author}</dd>
          <dt>{t("git.committer")}</dt>
          <dd className="break-words">
            {data.committer} ·{" "}
            {formatGitCommitTime(data.time, i18n.language, true)}
          </dd>
          <dt>{t("git.parents")}</dt>
          <dd className="select-text break-all font-mono">
            {data.parents.join("\n") || t("git.initialCommit")}
          </dd>
          {data.parents.length > 1 && <dd>{t("git.firstParentDiff")}</dd>}
        </dl>
      </details>
      <GitChangeFiles
        files={data.files.map((file) => ({
          ...file,
          staged: false,
          unstaged: false,
          conflicted: false,
        }))}
        staged={false}
        busy={false}
        batchLimited={false}
        fileLabel={t("git.commitFile")}
        selection={
          selected?.sha === sha
            ? { path: selected.path, staged: false }
            : undefined
        }
        onSelect={({ path }) => onSelect({ sha, path })}
      />
      {data.files.length === 0 && (
        <p className="px-3 py-2 text-xs text-muted">{t("git.noCommitFiles")}</p>
      )}
      {data.truncated && (
        <p className="px-3 py-2 text-xs text-muted">{t("git.truncated")}</p>
      )}
    </div>
  );
}
