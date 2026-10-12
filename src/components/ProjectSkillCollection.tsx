import { FileText, Square, SquareCheck, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProjectAgentTarget, SkillGroup } from "../lib/tauri";
import {
  getAssignedAgents,
  getProjectSkillStatusMeta as getSyncStatusMeta,
  type ProjectSkillEntry,
} from "../lib/projectSkillEntries";
import { getTagColor } from "../lib/skillTags";
import { cn } from "../utils";
import { ProjectEnabledAgents } from "./ProjectEnabledAgents";
import { ProjectSkillCardHeader } from "./ProjectSkillCardHeader";
import { ProjectSkillSyncActions } from "./ProjectSkillSyncActions";
import { ProjectSkillBadges } from "./ProjectSkillBadges";
import { ProjectAgentDots } from "./ProjectAgentDots";
import { ProjectSkillTeamStatus } from "./ProjectSkillTeamStatus";
import { ToggleSwitch } from "./ToggleSwitch";

interface ProjectSkillCollectionProps {
  skills: ProjectSkillEntry[];
  viewMode: "grid" | "list";
  isMultiSelect: boolean;
  selectedIds: ReadonlySet<string>;
  updatingCenterSkill: string | null;
  updatingProjectSkill: string | null;
  togglingSkill: string | null;
  togglingAgentTarget: { skillKey: string; agent: string } | null;
  repairingDirectory: string | null;
  allTags: string[];
  skillGroupsForEntry: ReadonlyMap<string, SkillGroup[]>;
  activeGroupId: string | null;
  targets: ProjectAgentTarget[];
  supportsToggle: boolean;
  onSelect: (key: string) => void;
  onOpenDetail: (skill: ProjectSkillEntry) => void;
  onUpdateCenter: (skill: ProjectSkillEntry) => Promise<void>;
  onUpdateProject: (skill: ProjectSkillEntry) => Promise<void>;
  onGroupClick: (id: string) => void;
  onToggleAgent: (
    skill: ProjectSkillEntry,
    agent: string,
    enabled: boolean,
  ) => Promise<void>;
  onToggleSkill: (skill: ProjectSkillEntry) => Promise<void>;
  onDelete: (skill: ProjectSkillEntry) => void;
  onRepair: (directory: string) => Promise<void>;
}

/** Both layouts use the same skill status, controls and selection behavior. */
export function ProjectSkillCollection({
  skills,
  viewMode,
  isMultiSelect,
  selectedIds,
  updatingCenterSkill,
  updatingProjectSkill,
  togglingSkill,
  togglingAgentTarget,
  repairingDirectory,
  allTags,
  skillGroupsForEntry,
  activeGroupId,
  targets,
  supportsToggle,
  onSelect,
  onOpenDetail,
  onUpdateCenter,
  onUpdateProject,
  onGroupClick,
  onToggleAgent,
  onToggleSkill,
  onDelete,
  onRepair,
}: ProjectSkillCollectionProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "pb-8",
        viewMode === "grid"
          ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          : "flex flex-col gap-0.5",
      )}
    >
      {skills.map((skill) => {
        const skillKey = skill.id;
        const isSelected = selectedIds.has(skillKey);
        const isUpdatingCenter = updatingCenterSkill === skillKey;
        const isUpdatingProject = updatingProjectSkill === skillKey;
        const isToggling = togglingSkill === skillKey;
        const statusMeta = getSyncStatusMeta(t, skill.status);
        const assignedAgents = getAssignedAgents(skill.variants);
        const teamStatusControl = (
          <ProjectSkillTeamStatus
            status={skill.teamStatus}
            repairing={repairingDirectory === skill.teamStatus?.directory}
            disabled={
              repairingDirectory !== null ||
              isUpdatingCenter ||
              isUpdatingProject ||
              isToggling
            }
            onRepair={
              isMultiSelect
                ? undefined
                : (directory) => void onRepair(directory)
            }
          />
        );

        if (viewMode === "grid") {
          return (
            <div
              key={skillKey}
              data-skill-directory={skill.relative_path}
              className={cn(
                "app-panel group relative flex h-full cursor-pointer flex-col overflow-hidden shadow-card transition-all hover:-translate-y-px hover:border-border hover:shadow-card-hover",
                isMultiSelect &&
                  isSelected &&
                  "ring-1 ring-accent border-accent/40",
              )}
              onClick={() =>
                isMultiSelect ? onSelect(skillKey) : onOpenDetail(skill)
              }
            >
              <ProjectSkillCardHeader
                title={skill.name}
                fileCount={skill.files.length}
                leading={
                  isMultiSelect ? (
                    isSelected ? (
                      <SquareCheck className="h-3.5 w-3.5 text-accent" />
                    ) : (
                      <Square className="h-3.5 w-3.5 text-faint" />
                    )
                  ) : (
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        skill.enabledCount === skill.totalCount
                          ? "bg-accent-light shadow-[0_0_0_3px_var(--color-accent-bg)]"
                          : skill.enabledCount > 0
                            ? "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.15)]"
                            : "bg-surface-active",
                      )}
                      title={`${skill.enabledCount}/${skill.totalCount}`}
                    />
                  )
                }
                actions={
                  !isMultiSelect && (
                    <ProjectSkillSyncActions
                      status={skill.status}
                      updatingCenter={isUpdatingCenter}
                      updatingProject={isUpdatingProject}
                      onUpdateCenter={() => void onUpdateCenter(skill)}
                      onUpdateProject={() => void onUpdateProject(skill)}
                    />
                  )
                }
              />

              <div className="px-3.5 pb-3">
                <ProjectEnabledAgents variants={skill.variants} />
                <p className="text-[13px] leading-[18px] text-muted truncate">
                  {skill.description || "\u2014"}
                </p>
                {teamStatusControl}
                {skill.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {skill.tags.map((tag) => (
                      <span
                        key={tag}
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          getTagColor(tag, allTags),
                        )}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-2.5 border-t border-border-faint px-3.5 py-2.5">
                <ProjectSkillBadges
                  status={statusMeta}
                  disabled={skill.enabledCount === 0}
                  groups={skillGroupsForEntry.get(skill.id) ?? []}
                  activeGroupId={activeGroupId}
                  onGroupClick={onGroupClick}
                />
                {!isMultiSelect && (
                  <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                    <ProjectAgentDots
                      assignedAgents={assignedAgents}
                      targets={targets}
                      limit={4}
                      size="sm"
                      onToggle={(agentKey, enabled) =>
                        onToggleAgent(skill, agentKey, enabled)
                      }
                      pendingKey={
                        togglingAgentTarget?.skillKey === skillKey
                          ? togglingAgentTarget.agent
                          : null
                      }
                    />
                    {supportsToggle ? (
                      <ToggleSwitch
                        checked={skill.enabledCount === skill.totalCount}
                        loading={isToggling}
                        onChange={() => onToggleSkill(skill)}
                        title={
                          skill.enabledCount === skill.totalCount
                            ? t("project.enabled")
                            : t("project.enableSkill")
                        }
                      />
                    ) : null}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(skill);
                      }}
                      className="rounded px-2 py-1 text-muted transition-colors outline-none hover:bg-red-500/10 hover:text-red-500"
                      title={t("project.deleteSkill")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        }

        // List view
        return (
          <div
            key={skillKey}
            data-skill-directory={skill.relative_path}
            className={cn(
              "app-panel group flex cursor-pointer flex-wrap items-center gap-3.5 rounded-xl border-transparent px-3.5 py-3 transition-all hover:border-border hover:bg-surface-hover",
              isMultiSelect &&
                isSelected &&
                "ring-1 ring-accent border-accent/40",
            )}
            onClick={() =>
              isMultiSelect ? onSelect(skillKey) : onOpenDetail(skill)
            }
          >
            <div className="flex h-4 w-4 shrink-0 items-center justify-center">
              {isMultiSelect ? (
                isSelected ? (
                  <SquareCheck className="h-3.5 w-3.5 text-accent" />
                ) : (
                  <Square className="h-3.5 w-3.5 text-faint" />
                )
              ) : (
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    skill.enabledCount === skill.totalCount
                      ? "bg-accent-light shadow-[0_0_0_3px_var(--color-accent-bg)]"
                      : skill.enabledCount > 0
                        ? "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.15)]"
                        : "bg-surface-active",
                  )}
                  title={`${skill.enabledCount}/${skill.totalCount}`}
                />
              )}
            </div>
            <h3
              className="w-[180px] shrink-0 truncate text-[14px] font-semibold text-secondary"
              title={skill.name}
            >
              {skill.name}
            </h3>

            <div className="min-w-0 flex-[1_1_200px]">
              <p className="truncate text-[13px] text-muted">
                {skill.description || "\u2014"}
              </p>
              {teamStatusControl}
            </div>

            {skill.tags.length > 0 && (
              <div className="flex shrink-0 items-center gap-1.5">
                {skill.tags.map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                      getTagColor(tag, allTags),
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex shrink-0 items-center gap-2.5">
              <ProjectSkillBadges
                status={statusMeta}
                disabled={skill.enabledCount === 0}
                groups={skillGroupsForEntry.get(skill.id) ?? []}
              />
              {skill.files.length > 0 && (
                <span className="flex items-center gap-1 text-[12px] text-faint">
                  <FileText className="w-3 h-3" />
                  {skill.files.length}
                </span>
              )}
              <ProjectEnabledAgents variants={skill.variants} />
              <ProjectAgentDots
                assignedAgents={assignedAgents}
                targets={targets}
                limit={4}
                size="sm"
                onToggle={
                  isMultiSelect
                    ? undefined
                    : (agentKey, enabled) =>
                        onToggleAgent(skill, agentKey, enabled)
                }
                pendingKey={
                  togglingAgentTarget?.skillKey === skillKey
                    ? togglingAgentTarget.agent
                    : null
                }
              />
            </div>

            {!isMultiSelect && (
              <>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <ProjectSkillSyncActions
                    variant="list"
                    status={skill.status}
                    updatingCenter={isUpdatingCenter}
                    updatingProject={isUpdatingProject}
                    onUpdateCenter={() => void onUpdateCenter(skill)}
                    onUpdateProject={() => void onUpdateProject(skill)}
                  />
                </div>
                {supportsToggle ? (
                  <ToggleSwitch
                    checked={skill.enabledCount === skill.totalCount}
                    loading={isToggling}
                    onChange={() => onToggleSkill(skill)}
                    title={
                      skill.enabledCount === skill.totalCount
                        ? t("project.enabled")
                        : t("project.enableSkill")
                    }
                  />
                ) : null}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(skill);
                  }}
                  className="shrink-0 rounded p-0.5 text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                  title={t("project.deleteSkill")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
