import { useRef } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CardActionMenu } from "../CardActionMenu";
import { useGitCopyActions } from "./useGitCopyActions";
import type { GitReferences } from "../../lib/gitApi";

/** Reference-specific actions share the workbench menu and its context trigger. */
export function GitReferenceSummary({
  entry,
}: {
  entry: GitReferences["entries"][number];
}) {
  const { t } = useTranslation();
  const summary = useRef<HTMLElement>(null);
  const actions = useGitCopyActions([
    {
      key: "copy-name",
      label: t(
        entry.kind === "tags" ? "git.copyTagName" : "git.copyReferenceName",
      ),
      text: entry.name,
    },
    ...(entry.sha
      ? [{ key: "copy-sha", label: t("git.copyCommitSha"), text: entry.sha }]
      : []),
  ]);
  return (
    <>
      <summary
        ref={summary}
        className="git-history-summary flex min-w-0 cursor-pointer items-center gap-1.5 px-2 py-1 pr-8 text-secondary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        title={entry.name}
      >
        <ChevronRight
          size={12}
          className="git-history-chevron shrink-0 text-muted"
        />
        {entry.kind === "tags" ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="max-w-full shrink-0 whitespace-normal break-all font-medium">
              {entry.name}
            </span>
            <span
              className="min-w-0 flex-1 truncate text-muted"
              title={entry.summary ?? undefined}
            >
              {entry.summary}
            </span>
          </span>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            <span className="shrink-0 font-mono text-muted">
              {entry.sha?.slice(0, 7)}
            </span>
          </>
        )}
      </summary>
      <CardActionMenu
        contextTarget={summary}
        className="absolute right-1 top-0.5"
        label={t("git.referenceActions")}
        actions={actions}
      />
    </>
  );
}
