import { isLocalSkillSource } from "../lib/skillUpdatePresentation";
import { useState, type ReactNode } from "react";
import {
  Folder,
  ChevronDown,
  ChevronUp,
  Github,
  HardDrive,
  Globe,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import {
  type ManagedSkill,
  type Project,
  type SkillGroup,
  type SkillToolToggle,
  type ToolInfo,
} from "../lib/tauri";
import { SkillContentPanel } from "./SkillContentPanel";
import { DetailSheet } from "./DetailSheet";
import { AgentToggleInline, type AgentToggleItem } from "./AgentToggleSection";
import { SkillProjectsSection } from "./SkillProjectsSection";
import { SyncDots } from "./SyncDots";
import { SkillDirectoryActions } from "./SkillDirectoryActions";
import { CopyPathButton } from "./CopyPathButton";
import { getSkillGroupIconOption } from "../lib/skillGroupIcons";
import { getSkillGroupDisplayName } from "../lib/skillGroupDisplay";

interface Props {
  skill: ManagedSkill | null;
  sourceInfo?: ReactNode;
  onClose: () => void;
  tools?: ToolInfo[];
  skillGroups?: SkillGroup[];
  toolToggles?: SkillToolToggle[] | null;
  togglingTool?: string | null;
  onToggleTool?: (tool: string, enabled: boolean) => void;
  onToggleTarget?: (tool: string, enabled: boolean) => void;
  pendingTargetKey?: string | null;
  projects?: Project[];
  onProjectsChanged?: () => void;
}

export function SkillDetailPanel({
  skill,
  onClose,
  tools,
  skillGroups,
  toolToggles,
  togglingTool,
  onToggleTool,
  onToggleTarget,
  pendingTargetKey,
  projects,
  onProjectsChanged,
  sourceInfo,
}: Props) {
  if (!skill) return null;

  return (
    <SkillDetailPanelContent
      key={skill.id}
      skill={skill}
      sourceInfo={sourceInfo}
      onClose={onClose}
      tools={tools}
      skillGroups={skillGroups}
      toolToggles={toolToggles}
      togglingTool={togglingTool}
      onToggleTool={onToggleTool}
      onToggleTarget={onToggleTarget}
      pendingTargetKey={pendingTargetKey}
      projects={projects}
      onProjectsChanged={onProjectsChanged}
    />
  );
}

function SkillDetailPanelContent({
  skill,
  onClose,
  tools,
  skillGroups,
  toolToggles,
  togglingTool,
  onToggleTool,
  onToggleTarget,
  pendingTargetKey,
  projects,
  onProjectsChanged,
  sourceInfo,
}: {
  skill: ManagedSkill;
  sourceInfo?: ReactNode;
  onClose: () => void;
  tools?: ToolInfo[];
  skillGroups?: SkillGroup[];
  toolToggles?: SkillToolToggle[] | null;
  togglingTool?: string | null;
  onToggleTool?: (tool: string, enabled: boolean) => void;
  onToggleTarget?: (tool: string, enabled: boolean) => void;
  pendingTargetKey?: string | null;
  projects?: Project[];
  onProjectsChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [isMetadataExpanded, setIsMetadataExpanded] = useState(false);

  const sourceIcon = (type: string) => {
    switch (type) {
      case "git":
      case "skillssh":
        return <Github className="h-3.5 w-3.5" />;
      case "local":
      case "import":
        return <HardDrive className="h-3.5 w-3.5" />;
      default:
        return <Globe className="h-3.5 w-3.5" />;
    }
  };

  const sourceTypeLabel = (type: string) =>
    type === "skillssh" ? "skills.sh" : type;

  const metadataItems = [
    {
      label: t("mySkills.sourceType"),
      value: sourceTypeLabel(skill.source_type),
    },
    {
      label: t(
        isLocalSkillSource(skill)
          ? "mySkills.importProvenance.title"
          : "mySkills.sourceRef",
      ),
      value: skill.source_ref,
    },
    { label: t("mySkills.sourceResolved"), value: skill.source_ref_resolved },
    { label: t("mySkills.sourceBranch"), value: skill.source_branch },
    { label: t("mySkills.sourceSubpath"), value: skill.source_subpath },
    { label: t("mySkills.sourceRevision"), value: skill.source_revision },
  ].filter((item) => Boolean(item.value));

  const belongsToGroups = (skillGroups ?? []).filter((g) =>
    skill.skill_group_ids.includes(g.id),
  );

  const toggleItems: AgentToggleItem[] = (toolToggles ?? []).map((toggle) => ({
    key: toggle.tool,
    displayName: toggle.display_name,
    enabled: toggle.enabled,
    isAvailable: toggle.installed && toggle.globally_enabled,
    disabled: !toggle.installed || !toggle.globally_enabled,
    badgeLabel: !toggle.installed
      ? t("mySkills.agentToggleNotInstalled")
      : !toggle.globally_enabled
        ? t("mySkills.agentToggleDisabledGlobally")
        : null,
  }));

  const meta = (
    <>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
        {toolToggles && onToggleTool ? (
          <AgentToggleInline
            items={toggleItems}
            togglingKey={togglingTool}
            onToggle={onToggleTool}
          />
        ) : tools ? (
          <SyncDots
            skill={skill}
            tools={tools}
            size="sm"
            includeOrphan
            onToggle={onToggleTarget}
            pendingKey={pendingTargetKey}
          />
        ) : null}
        {skill.tags.length > 0 && (
          <>
            {tools && <span className="mx-0.5 h-3 w-px bg-border-subtle" />}
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
      {belongsToGroups.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-faint">
            {t("sidebar.skillGroups")}
          </span>
          {belongsToGroups.map((group) => {
            const opt = getSkillGroupIconOption(group);
            const Icon = opt.icon;
            return (
              <span
                key={group.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  opt.activeClass,
                  opt.colorClass,
                )}
              >
                <Icon className="h-3 w-3" />
                {getSkillGroupDisplayName(group.name, t)}
              </span>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span className="font-mono truncate" title={skill.central_path}>
            {skill.central_path}
          </span>
          <CopyPathButton path={skill.central_path} />
        </div>
        <SkillDirectoryActions path={skill.central_path} />
      </div>
      {metadataItems.length > 0 && (
        <div className="mt-4 rounded-xl border border-border-subtle bg-surface/70">
          <button
            type="button"
            onClick={() => setIsMetadataExpanded((prev) => !prev)}
            aria-expanded={isMetadataExpanded}
            aria-controls="skill-source-metadata"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle bg-bg-secondary px-2 py-1 text-[12px] text-muted">
                {sourceIcon(skill.source_type)}
                {sourceTypeLabel(skill.source_type)}
              </span>
              <span className="truncate text-[13px] font-medium text-secondary">
                {t("mySkills.sourceType")}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted">
              <span>
                {isMetadataExpanded
                  ? t("mySkills.collapseAgentToggles")
                  : t("mySkills.expandAgentToggles")}
              </span>
              {isMetadataExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>
          </button>
          {isMetadataExpanded && (
            <div
              id="skill-source-metadata"
              className="border-t border-border-subtle px-4 py-3"
            >
              <div className="grid gap-2 md:grid-cols-2">
                {metadataItems.map((item) => (
                  <div key={item.label} className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                      {item.label}
                    </div>
                    <div
                      className="mt-0.5 truncate font-mono text-[12.5px] text-secondary"
                      title={item.value ?? undefined}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <DetailSheet
      open={true}
      title={skill.name}
      description={
        skill.description ? (
          <p className="line-clamp-3">{skill.description}</p>
        ) : undefined
      }
      meta={meta}
      onClose={onClose}
    >
      {sourceInfo}

      {projects && projects.length > 0 && (
        <SkillProjectsSection
          skill={skill}
          projects={projects}
          tools={tools ?? []}
          onChanged={onProjectsChanged}
        />
      )}

      <SkillContentPanel skill={skill} />
    </DetailSheet>
  );
}
