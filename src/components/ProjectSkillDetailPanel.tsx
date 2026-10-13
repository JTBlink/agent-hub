import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, FileText, RefreshCw } from "lucide-react";
import { cn } from "../utils";
import {
  getProjectSkillStatusMeta,
  getAssignedAgents,
  getAgentDotTargets,
  type ProjectSkillEntry,
} from "../lib/projectSkillEntries";
import { DetailSheet } from "./DetailSheet";
import { SkillDirectoryActions } from "./SkillDirectoryActions";
import { CopyPathButton } from "./CopyPathButton";
import { ProjectAgentDots } from "./ProjectAgentDots";
import { ProjectSkillSyncActions } from "./ProjectSkillSyncActions";
import { SkillMarkdown } from "./SkillMarkdown";
import { SkillSourceDiffViewer } from "./SkillSourceDiffViewer";
import { useProjectSkillContent } from "../hooks/useProjectSkillContent";

export function ProjectSkillDetailPanel({
  projectId,
  skill,
  updatingCenter,
  updatingProject,
  onUpdateCenter,
  onUpdateProject,
  onClose,
}: {
  projectId: string;
  skill: ProjectSkillEntry;
  updatingCenter: boolean;
  updatingProject: boolean;
  onUpdateCenter: () => void;
  onUpdateProject: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const contentId = useId();
  const tabs = ["local", "diff", "center"] as const;
  const [selectedAgent, setSelectedAgent] = useState(
    () =>
      (
        skill.variants.find(
          (variant) => variant.sync_status === "project_newer",
        ) ?? skill.primaryVariant
      ).agent,
  );
  const variant =
    skill.variants.find((item) => item.agent === selectedAgent) ??
    skill.primaryVariant;
  const content = useProjectSkillContent(projectId, variant);
  const contentTab = content.tab;
  const active =
    contentTab === "diff"
      ? content.diff
      : contentTab === "center"
        ? content.center
        : content.local;
  const status = getProjectSkillStatusMeta(t, variant.sync_status);
  const entries = content.diff.data?.entries;
  const summary = entries && {
    count: entries.length,
    added: entries.filter((entry) => entry.status === "added").length,
    modified: entries.filter((entry) => entry.status === "modified").length,
    removed: entries.filter((entry) => entry.status === "removed").length,
  };
  const meta = (
    <>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
        <ProjectAgentDots
          assignedAgents={getAssignedAgents(skill.variants)}
          targets={getAgentDotTargets(skill.variants).map((t) => ({
            key: t.key,
            display_name: t.display_name,
            enabled: true,
            installed: true,
            is_custom: false,
          }))}
        />
        {skill.tags.length > 0 && (
          <>
            <span className="mx-0.5 h-3 w-px bg-border-subtle" />
            {skill.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-secondary"
              >
                {tag}
              </span>
            ))}
          </>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[12.5px] text-muted">
        <div className="flex min-w-0 items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="font-mono truncate" title={variant.path}>
            {variant.path}
          </span>
          <CopyPathButton path={variant.path} />
        </div>
        {skill.files.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            {skill.files.join(", ")}
          </div>
        )}
        <SkillDirectoryActions path={variant.path} />
      </div>
    </>
  );

  return (
    <DetailSheet
      open={true}
      title={skill.name}
      headerActions={
        <ProjectSkillSyncActions
          status={skill.status}
          updatingCenter={updatingCenter}
          updatingProject={updatingProject}
          onUpdateCenter={onUpdateCenter}
          onUpdateProject={onUpdateProject}
        />
      }
      description={
        skill.description ? (
          <p className="line-clamp-3">{skill.description}</p>
        ) : undefined
      }
      meta={meta}
      onClose={onClose}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="font-medium text-secondary">
          {t("project.comparison.copy")}
        </span>
        {skill.variants.length > 1 ? (
          <select
            aria-label={t("project.comparison.copy")}
            value={variant.agent}
            onChange={(event) => setSelectedAgent(event.target.value)}
            className="rounded-lg border border-border-subtle bg-surface px-2 py-1 text-secondary"
          >
            {skill.variants.map((item) => (
              <option key={item.agent} value={item.agent}>
                {item.agent_display_name} ·{" "}
                {getProjectSkillStatusMeta(t, item.sync_status).label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-secondary">{variant.agent_display_name}</span>
        )}
        <span className={cn("rounded-full px-2 py-1", status.className)}>
          {status.label}
        </span>
        {content.diff.data?.source_version && (
          <span className="font-mono text-muted">
            v{content.diff.data.source_version.replace(/^v/, "")}
          </span>
        )}
        <button
          type="button"
          onClick={content.refresh}
          disabled={active.loading}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-muted hover:bg-surface-hover disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("mySkills.contentComparison.refresh")}
        </button>
      </div>
      {content.comparable && (
        <>
          <div
            className="mb-3 flex flex-wrap items-center gap-2"
            role="tablist"
            aria-label={t("mySkills.contentComparison.tabs")}
          >
            {tabs.map((tab, index) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${contentId}-${tab}`}
                aria-controls={`${contentId}-panel`}
                aria-selected={contentTab === tab}
                tabIndex={contentTab === tab ? 0 : -1}
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
                  const tabButtons =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      '[role="tab"]',
                    );
                  tabButtons?.item(next)?.focus();
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  contentTab === tab
                    ? "bg-accent text-white"
                    : "bg-surface-hover text-muted hover:text-secondary",
                )}
              >
                {t(
                  tab === "center"
                    ? "project.docTabs.center"
                    : `mySkills.docTabs.${tab}`,
                )}
                {tab === "diff" && summary && (
                  <span className="ml-1.5">{summary.count}</span>
                )}
              </button>
            ))}
          </div>
          <div
            aria-live="polite"
            className="mb-3 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-[12px] text-secondary"
          >
            {content.diff.loading
              ? t("mySkills.contentComparison.comparing")
              : content.diff.error
                ? t("mySkills.sourceDiffUnavailable")
                : summary
                  ? summary.count
                    ? t("mySkills.contentComparison.summary", summary)
                    : t("mySkills.sourceDiff.noChanges")
                  : t("mySkills.contentComparison.notCompared")}
          </div>
        </>
      )}
      <div role="tabpanel" aria-busy={active.loading} className="space-y-3">
        {active.loading ? (
          <p className="py-8 text-center text-[13px] text-muted">
            {t("common.loading")}
          </p>
        ) : active.error ? (
          <div role="alert" className="space-y-2 text-[13px] text-muted">
            <p>{active.error}</p>
            <button
              type="button"
              onClick={content.refresh}
              className="text-accent-light"
            >
              {t("mySkills.contentComparison.retry")}
            </button>
          </div>
        ) : contentTab === "diff" && content.diff.data ? (
          <SkillSourceDiffViewer
            entries={content.diff.data.entries}
            comparison={content.diff.data}
            local
            sourceOnLeft
            sourceTitle={t("project.comparison.projectVersion")}
          />
        ) : contentTab === "center" && content.center.data ? (
          <SkillMarkdown content={content.center.data.content} />
        ) : content.local.data ? (
          <SkillMarkdown content={content.local.data.content} />
        ) : null}
      </div>
    </DetailSheet>
  );
}
