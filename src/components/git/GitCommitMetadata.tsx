import { useTranslation } from "react-i18next";
import type { GitCommitDetails } from "../../lib/gitApi";

/** Shared commit identity and full message, independent of the history/graph host. */
export function GitCommitMetadata({
  data,
  onSelectParent,
}: {
  data: GitCommitDetails;
  onSelectParent?: (sha: string) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="min-w-0 select-text px-3 py-2 text-xs">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-muted">
        <dt>SHA</dt>
        <dd className="break-all font-mono text-secondary">{data.sha}</dd>
        <dt>{t("git.parents")}</dt>
        <dd className="flex flex-wrap gap-x-3 gap-y-1 break-all font-mono">
          {data.parents.length
            ? data.parents.map((sha) =>
                onSelectParent ? (
                  <button
                    key={sha}
                    type="button"
                    onClick={() => onSelectParent(sha)}
                    className="break-all text-left text-accent-light underline focus-visible:outline focus-visible:outline-accent"
                  >
                    {sha}
                  </button>
                ) : (
                  <span key={sha}>{sha}</span>
                ),
              )
            : t("git.initialCommit")}
        </dd>
        <dt>{t("git.author")}</dt>
        <dd className="break-words">
          {data.author} {data.author_email && `<${data.author_email}>`}
        </dd>
        <dt>{t("git.committer")}</dt>
        <dd className="break-words">
          {data.committer} {data.committer_email && `<${data.committer_email}>`}
        </dd>
        <dt>{t("git.graph.date")}</dt>
        <dd>
          {new Date(data.time * 1000).toLocaleString(i18n.language, {
            timeZoneName: "short",
          })}
        </dd>
      </dl>
      <p className="mt-4 whitespace-pre-wrap break-words text-secondary">
        {data.message}
      </p>
      {data.parents.length > 1 && (
        <p className="mt-2 text-muted">{t("git.firstParentDiff")}</p>
      )}
    </div>
  );
}
