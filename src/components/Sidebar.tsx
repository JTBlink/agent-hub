import { useState, useEffect, useRef } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Compass,
  RefreshCw,
  Settings,
  Plus,
  Trash2,
  FolderOpen,
  GripVertical,
  Link2,
  CalendarClock,
  TerminalSquare,
  ListTodo,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import { useApp } from "../context/AppContext";
import { AddProjectDialog } from "./AddProjectDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { useSidebarSections } from "../hooks/useSidebarSections";
import { SidebarSectionHeader } from "./SidebarSectionHeader";
import { SidebarAgentWorkspaces } from "./SidebarAgentWorkspaces";
import * as api from "../lib/tauri";
import type { SyncHealth } from "../lib/tauri";
import { SidebarSkillGroups } from "./SidebarSkillGroups";

function getSyncHealthIndicator(
  health: SyncHealth,
  skillCount: number,
): { color: string; title: string } | null {
  if (skillCount === 0) return null;
  if (health.diverged > 0)
    return { color: "bg-red-400", title: `${health.diverged} diverged` };
  if (health.project_newer > 0 || health.center_newer > 0) {
    const parts: string[] = [];
    if (health.project_newer > 0)
      parts.push(`${health.project_newer} project newer`);
    if (health.center_newer > 0)
      parts.push(`${health.center_newer} center newer`);
    return { color: "bg-amber-400", title: parts.join(", ") };
  }
  if (health.project_only > 0)
    return {
      color: "bg-blue-400",
      title: `${health.project_only} project only`,
    };
  if (health.in_sync === skillCount)
    return { color: "bg-emerald-400", title: "All in sync" };
  return null;
}

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { projects, refreshProjects, tools, managedSkills, appUpdate } =
    useApp();
  const [showAddProject, setShowAddProject] = useState(false);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [orderedProjects, setOrderedProjects] = useState(projects);
  const projectReorderQueueRef = useRef<Promise<void>>(Promise.resolve());
  const { expandedSection, toggleSection } = useSidebarSections(
    location.pathname,
  );
  const projectsOpen = expandedSection === "projects";

  useEffect(() => {
    setOrderedProjects(projects);
  }, [projects]);
  const handleProjectDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index)
      return;
    const reordered = [...orderedProjects];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setOrderedProjects(reordered);

    projectReorderQueueRef.current = projectReorderQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await api.reorderProjects(reordered.map((p) => p.id));
        } catch {
          await refreshProjects();
          toast.error(t("common.error"));
        }
      });
  };

  const NAV_ITEMS = [
    { name: t("sidebar.dashboard"), path: "/", icon: LayoutDashboard },
    { name: t("discovery.title"), path: "/discover", icon: Compass },
    { name: t("sidebar.backup"), path: "/backup", icon: RefreshCw },
    { name: t("automation.title"), path: "/automation", icon: CalendarClock },
    { name: t("tasks.title"), path: "/tasks", icon: ListTodo },
    { name: t("terminal.title"), path: "/terminal", icon: TerminalSquare },
  ];

  const handleDeleteProject = async () => {
    if (!deleteProjectTarget) return;
    await api.removeProject(deleteProjectTarget.id);
    await refreshProjects();
    if (location.pathname.startsWith("/project/")) {
      navigate("/");
    }
    toast.success(t("project.removed"));
  };

  return (
    <>
      <div className="w-[220px] flex-shrink-0 bg-bg-secondary border-r border-border-subtle h-full flex flex-col select-none relative z-10">
        {/* Traffic-light safe zone */}
        <div className="h-[38px] shrink-0" />
        {/* App logo — sits below macOS window controls */}
        <div className="flex items-center px-3 gap-3 pb-2.5 shrink-0">
          <img
            src="/icons/32x32.png"
            alt="logo"
            className="w-[24px] h-[24px] shrink-0"
          />
          <span className="text-[16px] font-semibold text-secondary tracking-tight truncate leading-[22px]">
            {t("app.name")}
          </span>
        </div>

        {/* Nav */}
        <div className="px-2.5 space-y-0.5 shrink-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path === "/discover" && location.pathname === "/install");
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-sm font-medium transition-colors outline-none",
                  isActive
                    ? "bg-surface-active text-primary"
                    : "text-tertiary hover:text-secondary hover:bg-surface-hover",
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0",
                    isActive ? "text-accent" : "text-muted",
                  )}
                />
                {item.name}
              </Link>
            );
          })}
        </div>

        {/* Divider */}
        <div className="mx-3 mt-3.5 mb-2.5 border-t border-border-subtle" />

        {/* Scrollable section */}
        <div className="px-2.5 flex-1 overflow-y-auto scrollbar-hide min-h-0">
          <SidebarSkillGroups
            isOpen={expandedSection === "skills"}
            onToggle={() => toggleSection("skills")}
          />

          {/* Divider */}
          <div className="mx-0.5 mt-3.5 mb-2.5 border-t border-border-subtle" />

          <SidebarAgentWorkspaces
            tools={tools}
            managedSkills={managedSkills}
            isOpen={expandedSection === "agents"}
            onToggle={() => toggleSection("agents")}
          />

          {/* Divider */}
          <div className="mx-0.5 mt-3.5 mb-2.5 border-t border-border-subtle" />

          {/* ── Projects ── */}
          <SidebarSectionHeader
            label={t("sidebar.projects")}
            isOpen={projectsOpen}
            onToggle={() => toggleSection("projects")}
          />
          {projectsOpen && (
            <>
              <DragDropContext onDragEnd={handleProjectDragEnd}>
                <Droppable droppableId="projects">
                  {(droppableProvided) => (
                    <div
                      className="space-y-0.5"
                      ref={droppableProvided.innerRef}
                      {...droppableProvided.droppableProps}
                    >
                      {orderedProjects.map((project, index) => {
                        const isActive =
                          location.pathname === `/project/${project.id}`;
                        const healthIndicator = getSyncHealthIndicator(
                          project.sync_health,
                          project.skill_count,
                        );
                        return (
                          <Draggable
                            key={project.id}
                            draggableId={project.id}
                            index={index}
                          >
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn(
                                  "group relative flex items-center rounded-md transition-colors",
                                  isActive
                                    ? "bg-surface-active"
                                    : "hover:bg-surface-hover",
                                )}
                              >
                                <button
                                  onClick={() => {
                                    void api.touchProjectVisited(project.id);
                                    navigate(`/project/${project.id}`);
                                  }}
                                  className={cn(
                                    "flex min-w-0 flex-1 items-center gap-2 px-2.5 py-[7px] text-left text-sm leading-5 outline-none",
                                    isActive
                                      ? "font-medium text-primary"
                                      : "text-tertiary group-hover:text-secondary",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded border",
                                      isActive
                                        ? project.workspace_type === "linked"
                                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                                          : "border-blue-500/30 bg-blue-500/10 text-blue-500"
                                        : "border-border bg-surface text-muted group-hover:border-border group-hover:text-tertiary",
                                    )}
                                  >
                                    {project.workspace_type === "linked" ? (
                                      <Link2 className="h-3 w-3" />
                                    ) : (
                                      <FolderOpen className="h-3 w-3" />
                                    )}
                                  </span>
                                  <span className="flex-1 truncate">
                                    {project.name}
                                  </span>
                                  <span className="ml-auto flex h-[18px] w-[52px] shrink-0 items-center justify-end gap-2 group-hover:hidden">
                                    {healthIndicator && (
                                      <span
                                        className={cn(
                                          "h-1.5 w-1.5 shrink-0 rounded-full",
                                          healthIndicator.color,
                                        )}
                                        title={healthIndicator.title}
                                      />
                                    )}
                                    {project.skill_count > 0 && (
                                      <span
                                        className={cn(
                                          "min-w-[24px] rounded-full px-1.5 text-center text-[12px] font-medium leading-[18px] tabular-nums",
                                          isActive
                                            ? "bg-accent-bg text-accent-light"
                                            : "bg-surface-hover text-muted",
                                        )}
                                      >
                                        {project.skill_count}
                                      </span>
                                    )}
                                  </span>
                                </button>
                                <div
                                  className={cn(
                                    "absolute right-1 flex items-center rounded-md invisible opacity-0 transition-opacity group-hover:visible group-hover:opacity-100",
                                    isActive
                                      ? "bg-surface-active"
                                      : "bg-surface-hover",
                                  )}
                                >
                                  <div
                                    {...provided.dragHandleProps}
                                    className="rounded p-1 text-faint cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical className="h-3 w-3" />
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setDeleteProjectTarget(project);
                                    }}
                                    className="rounded p-1 text-faint transition hover:text-red-400"
                                    title={t("common.delete")}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {droppableProvided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              <button
                onClick={() => setShowAddProject(true)}
                className="flex items-center gap-2 px-2.5 py-[7px] mt-1 rounded-md text-sm text-muted hover:text-secondary hover:bg-surface-hover transition-colors w-full outline-none"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("sidebar.addProject")}
              </button>
            </>
          )}
        </div>

        {/* Settings */}
        <div className="p-2.5 border-t border-border-subtle shrink-0">
          <Link
            to="/settings"
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-sm font-medium transition-colors outline-none",
              location.pathname === "/settings"
                ? "bg-surface-active text-primary"
                : "text-tertiary hover:text-secondary hover:bg-surface-hover",
            )}
          >
            <Settings
              className={cn(
                "w-4 h-4 shrink-0",
                location.pathname === "/settings"
                  ? "text-accent"
                  : "text-muted",
              )}
            />
            {t("sidebar.settings")}
            {/* A newer app version exists. Amber = "有更新" per the UI spec;
                the dot only points at Settings, where the user decides. */}
            {appUpdate?.has_update && (
              <span
                className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                title={t("settings.updateAvailable", {
                  version: appUpdate.latest_version,
                })}
              />
            )}
          </Link>
        </div>
      </div>

      <AddProjectDialog
        open={showAddProject}
        onClose={() => setShowAddProject(false)}
        onAdded={async () => {
          await refreshProjects();
          toast.success(t("project.workspaceAdded"));
        }}
      />

      <ConfirmDialog
        open={deleteProjectTarget !== null}
        message={t("project.removeConfirm", {
          name: deleteProjectTarget?.name || "",
        })}
        onClose={() => setDeleteProjectTarget(null)}
        onConfirm={handleDeleteProject}
      />
    </>
  );
}
