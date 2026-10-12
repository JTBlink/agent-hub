import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import { DocumentDiffViewer } from "./DocumentDiffViewer";
import type { SkillSourceDiff, SkillSourceDiffEntry } from "../lib/tauri";

interface Props {
  entries: SkillSourceDiffEntry[];
  comparison: SkillSourceDiff;
  local: boolean;
  sourceTitle?: string;
  sourceOnLeft?: boolean;
  className?: string;
}

const STATUS_TONE: Record<SkillSourceDiffEntry["status"], string> = {
  added:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  removed:
    "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  modified:
    "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
};

export function SkillSourceDiffViewer({
  entries,
  comparison,
  local,
  sourceTitle,
  sourceOnLeft = false,
  className,
}: Props) {
  const { t } = useTranslation();
  const sides = sourceOnLeft ? ["source", "central"] : ["central", "source"];

  if (entries.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border-subtle bg-bg-secondary px-4 py-6 text-center",
          className,
        )}
      >
        <div className="text-[13px] font-medium text-secondary">
          {t("mySkills.sourceDiff.noChanges")}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <p className="text-[12px] text-muted">
        {!sourceOnLeft && (
          <>
            {t(
              `mySkills.contentComparison.versionOrder.${comparison.version_comparison ?? "unknown"}`,
            )}{" "}
          </>
        )}
        {t(
          sourceOnLeft
            ? "project.comparison.diffLegend"
            : "mySkills.contentComparison.diffLegend",
        )}
      </p>
      {entries.map((entry) => (
        <div
          key={entry.relative_path}
          className="overflow-hidden rounded-xl border border-border-subtle"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface px-3 py-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                STATUS_TONE[entry.status],
              )}
            >
              {t(`mySkills.sourceDiff.status.${entry.status}`)}
            </span>
            <span
              className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-secondary"
              title={entry.relative_path}
            >
              {entry.relative_path}
            </span>
            {entry.status === "modified" &&
              entry.executable_before !== entry.executable_after && (
                <span className="inline-flex items-center rounded-full border border-border-subtle bg-bg-secondary px-2 py-0.5 text-[11px] text-muted">
                  {t("mySkills.sourceDiff.execBit", {
                    before: entry.executable_before ? "0755" : "0644",
                    after: entry.executable_after ? "0755" : "0644",
                  })}
                </span>
              )}
          </div>

          <div className="grid grid-cols-2 border-b border-border-subtle bg-bg-secondary">
            {sides.map((side) => {
              const path =
                side === "central"
                  ? comparison.central_path
                  : comparison.source_path;
              const version =
                side === "central"
                  ? comparison.central_version
                  : comparison.source_version;
              const missing =
                side === "central"
                  ? entry.status === "added"
                  : entry.status === "removed";
              return (
                <div
                  key={side}
                  data-diff-side={side}
                  className="min-w-0 px-3 py-3 first:border-r first:border-border-subtle"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-secondary">
                    <span>
                      {side === "source" && sourceTitle
                        ? sourceTitle
                        : t(
                            `mySkills.contentComparison.${side === "central" ? "centralVersion" : local ? "localVersion" : "sourceVersion"}`,
                          )}
                    </span>
                    <span className="font-mono font-normal text-muted">
                      {version
                        ? `v${version.replace(/^v/, "")}`
                        : t("mySkills.contentComparison.versionMissing")}
                    </span>
                    {comparison.version_comparison === `${side}_newer` && (
                      <span className="rounded-full bg-accent-bg px-2 py-0.5 text-accent-light">
                        {t("mySkills.contentComparison.newerVersion")}
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-1 break-all font-mono text-[11px] text-muted"
                    title={`${path?.replace(/[\\/]$/, "")}/${entry.relative_path}`}
                  >
                    {path?.replace(/[\\/]$/, "")}/{entry.relative_path}
                  </div>
                  {missing && (
                    <div className="mt-1 text-[11px] text-muted">
                      {t("mySkills.contentComparison.fileMissing")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {entry.content_kind === "text" ? (
            <DocumentDiffViewer
              original={entry.original_text ?? ""}
              updated={entry.updated_text ?? ""}
              updatedOnLeft={sourceOnLeft}
              className="!space-y-0 !rounded-none !border-0"
            />
          ) : (
            <div className="px-4 py-4 text-[12.5px] text-muted">
              {t(`mySkills.sourceDiff.summary.${entry.content_kind}`)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
