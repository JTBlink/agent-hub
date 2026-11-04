import { useTranslation } from "react-i18next";
import { cn } from "../../utils";
import type {
  GitFileDecoration,
  WorktreeDecoration,
} from "../../lib/worktreeDecorations";

type Decoration = GitFileDecoration;

/** Keep status explanations independent of filename and file-type icon colors. */
export function GitStatusIndicator({
  decoration,
  directory,
}: {
  decoration: Decoration;
  directory?: WorktreeDecoration;
}) {
  const { t } = useTranslation();
  const label = directory
    ? t("git.directoryChanges", {
        count: directory.count,
        details: Object.entries(directory.counts)
          .map(([status, count]) =>
            t("git.stateCount", { state: t(`git.states.${status}`), count }),
          )
          .join(t("git.stateSeparator")),
      })
    : t(`git.states.${decoration.status}`);
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "w-4 shrink-0 text-center font-mono text-xs tabular-nums",
        directory ? "text-muted" : decoration.color,
      )}
    >
      {directory ? directory.count : decoration.marker}
    </span>
  );
}
