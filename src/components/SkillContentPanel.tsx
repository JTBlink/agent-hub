import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import {
  useSkillContent,
  type SkillContentTab,
} from "../hooks/useSkillContent";
import type { ManagedSkill } from "../lib/tauri";
import { cn } from "../utils";
import { SkillFileBrowser } from "./SkillFileBrowser";
import { SkillMarkdown } from "./SkillMarkdown";
import { SkillSourceDiffViewer } from "./SkillSourceDiffViewer";

export function SkillContentPanel({ skill }: { skill: ManagedSkill }) {
  const { t } = useTranslation();
  const content = useSkillContent(skill);
  const id = useId();
  const buttons = useRef(new Map<SkillContentTab, HTMLButtonElement>());
  const tabs: SkillContentTab[] = content.local
    ? ["source", "diff", "central"]
    : ["central", "diff", "source"];
  const label = (tab: SkillContentTab) =>
    t(
      tab === "source" && content.local
        ? "mySkills.docTabs.local"
        : `mySkills.docTabs.${tab}`,
    );
  const entries = content.diff.data?.entries;
  const summary = entries && {
    count: entries.length,
    added: entries.filter((entry) => entry.status === "added").length,
    modified: entries.filter((entry) => entry.status === "modified").length,
    removed: entries.filter((entry) => entry.status === "removed").length,
  };
  const active =
    content.tab === "central"
      ? content.central
      : content.tab === "source"
        ? content.source
        : content.diff;
  const busy =
    content.central.loading || content.source.loading || content.diff.loading;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {content.comparable && (
          <div
            role="tablist"
            aria-label={t("mySkills.contentComparison.tabs")}
            className="flex flex-wrap gap-2"
          >
            {tabs.map((tab, index) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${id}-${tab}`}
                aria-selected={content.tab === tab}
                aria-controls={`${id}-panel`}
                tabIndex={content.tab === tab ? 0 : -1}
                ref={(node) => {
                  if (node) buttons.current.set(tab, node);
                  else buttons.current.delete(tab);
                }}
                onClick={() => content.select(tab)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % tabs.length
                      : event.key === "ArrowLeft"
                        ? (index + tabs.length - 1) % tabs.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  content.select(tabs[next]);
                  buttons.current.get(tabs[next])?.focus();
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  content.tab === tab
                    ? "bg-accent text-white"
                    : "bg-surface-hover text-muted hover:text-secondary",
                )}
              >
                {label(tab)}
                {tab === "diff" && summary && (
                  <span className="ml-1.5">{summary.count}</span>
                )}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={content.refresh}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-muted hover:bg-surface-hover disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
          {t("mySkills.contentComparison.refresh")}
        </button>
      </div>
      {content.comparable && (
        <div
          aria-live="polite"
          className="rounded-xl border border-border-subtle bg-surface px-3 py-2 text-[12px] text-secondary"
        >
          {content.diff.loading
            ? t("mySkills.contentComparison.comparing")
            : content.diff.error
              ? t("mySkills.sourceDiffUnavailable")
              : summary
                ? summary.count === 0
                  ? t("mySkills.sourceDiff.noChanges")
                  : t("mySkills.contentComparison.summary", summary)
                : t("mySkills.contentComparison.notCompared")}
        </div>
      )}
      <div
        role={content.comparable ? "tabpanel" : undefined}
        id={`${id}-panel`}
        aria-labelledby={
          content.comparable ? `${id}-${content.tab}` : undefined
        }
        aria-busy={active.loading}
        className="space-y-3"
      >
        <div className="text-[12px] font-medium text-muted">
          {content.tab === "diff"
            ? `${label("central")} → ${label("source")}`
            : t(
                content.tab === "central"
                  ? "mySkills.contentComparison.centralVersion"
                  : content.local
                    ? "mySkills.contentComparison.localVersion"
                    : "mySkills.contentComparison.sourceVersion",
              )}
        </div>
        {active.loading ? (
          <p className="py-8 text-center text-[13px] text-muted">
            {t("common.loading")}
          </p>
        ) : active.error ? (
          <div role="alert" className="space-y-2 text-[13px] text-muted">
            <p>
              {content.tab === "central"
                ? t("common.documentMissing")
                : t("mySkills.sourceDiffUnavailable")}
            </p>
            <p>{active.error}</p>
            <button
              type="button"
              onClick={content.refresh}
              className="text-accent-light"
            >
              {t("mySkills.contentComparison.retry")}
            </button>
          </div>
        ) : content.tab === "diff" && entries ? (
          <SkillSourceDiffViewer entries={entries} />
        ) : content.tab === "source" && content.source.data ? (
          <SkillMarkdown content={content.source.data.content} />
        ) : content.tab === "central" && content.central.data ? (
          <SkillFileBrowser
            skillId={skill.id}
            initialDoc={content.central.data}
          />
        ) : null}
      </div>
    </section>
  );
}
