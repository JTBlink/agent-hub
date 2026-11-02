import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HerdrPane, HerdrWorkspace } from "../lib/herdrControlApi";
import { HerdrWorktreeMenu } from "./HerdrWorktreeMenu";
import { HerdrWorkspaceRow } from "./HerdrWorkspaceRow";

import type { Project } from "../../../lib/tauri";
import { useProjectWorktrees } from "../../../hooks/useProjectWorktrees";
import { worktreeDirectoryName } from "../../../lib/worktreeApi";
import { groupHerdrWorkspaces } from "../lib/herdrWorkspaces";

export function HerdrWorkspaceList({
  spaces,
  agents,
  selected,
  disabled,
  onOpen,
  projects = [],
  session = "default",
  onWorktreeDeleted,
  onOpenWorktree,
}: {
  spaces: HerdrWorkspace[];
  agents: HerdrPane[];
  selected?: string;
  disabled: boolean;
  onOpen: (id: string) => void;
  session?: string;
  onWorktreeDeleted?: (projectId: string, path: string) => void;
  projects?: Project[];
  onOpenWorktree?: (
    projectId: string,
    path: string,
    parentWorkspaceId: string,
  ) => void;
}) {
  const { roots, children } = groupHerdrWorkspaces(spaces);
  return roots.map((space) => (
    <HerdrWorkspaceGroup
      key={space.workspace_id}
      space={space}
      session={session}
      onWorktreeDeleted={onWorktreeDeleted}
      linked={children.get(space.workspace_id) ?? []}
      agents={agents}
      selected={selected}
      disabled={disabled}
      onOpen={onOpen}
      project={projects.find((project) => project.path === space.directory)}
      onOpenWorktree={onOpenWorktree}
    />
  ));
}

function HerdrWorkspaceGroup({
  space,
  session,
  onWorktreeDeleted,
  linked: opened,
  agents,
  selected,
  disabled,
  onOpen,
  project,
  onOpenWorktree,
}: {
  space: HerdrWorkspace;
  session: string;
  onWorktreeDeleted?: (projectId: string, path: string) => void;
  linked: HerdrWorkspace[];
  agents: HerdrPane[];
  selected?: string;
  disabled: boolean;
  onOpen: (id: string) => void;
  project?: Project;
  onOpenWorktree?: (
    projectId: string,
    path: string,
    parentWorkspaceId: string,
  ) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const { worktrees, refresh } = useProjectWorktrees(
    onOpenWorktree ? project?.id : undefined,
  );
  const missing = worktrees.filter(
    (tree) =>
      tree.path !== space.directory &&
      !opened.some((child) => child.directory === tree.path),
  );
  const linked = [
    ...opened,
    ...missing.map((tree): HerdrWorkspace => ({
      workspace_id: `worktree:${tree.path}`,
      label: worktreeDirectoryName(tree.path),
      directory: tree.path,
      branch: tree.branch,
      active_tab_id: "",
      repository_icon: space.repository_icon,
    })),
  ];
  const openWorktree = (checkout: HerdrWorkspace) => {
    if (checkout !== space && project && checkout.directory && onOpenWorktree)
      onOpenWorktree(project.id, checkout.directory, space.workspace_id);
    else onOpen(checkout.workspace_id);
  };
  const openWorkspace = (checkout: HerdrWorkspace) => {
    if (
      missing.some((tree) => `worktree:${tree.path}` === checkout.workspace_id)
    )
      openWorktree(checkout);
    else onOpen(checkout.workspace_id);
  };
  const row = (space: HerdrWorkspace, connector?: "├" | "└") => {
    const tree = worktrees.find((tree) => tree.path === space.directory);
    const canDelete =
      project && tree && !tree.is_main && tree.path !== project.path;
    return (
      <HerdrWorktreeMenu
        target={connector ? "worktree" : "project"}
        disabled={disabled || tree?.available === false}
        onOpen={() => openWorktree(space)}
        deletion={
          canDelete
            ? {
                session,
                projectId: project.id,
                path: tree.path,
                workspaceId: missing.some(
                  (tree) => `worktree:${tree.path}` === space.workspace_id,
                )
                  ? undefined
                  : space.workspace_id,
                disabled: tree.locked,
                onDeleted: () => {
                  void refresh();
                  onWorktreeDeleted?.(project.id, tree.path);
                },
              }
            : undefined
        }
      >
        <HerdrWorkspaceRow
          workspace={space}
          connector={connector}
          agents={agents.filter(
            (agent) => agent.workspace_id === space.workspace_id,
          )}
          selected={selected === space.workspace_id}
          disabled={disabled}
          onOpen={() => openWorkspace(space)}
          unavailable={tree?.available === false}
        />
      </HerdrWorktreeMenu>
    );
  };
  return (
    <div key={space.workspace_id}>
      <div className="relative">
        <div className={linked.length ? "pr-6" : undefined}>{row(space)}</div>
        {linked.length > 0 && (
          <button
            className="app-button-ghost absolute right-1 top-1.5 rounded p-1 focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={t("herdr.worktrees", { name: space.label })}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
      </div>
      {expanded && linked.length > 0 && (
        <div className="ml-5">
          {linked.map((child, index) => (
            <div key={child.workspace_id}>
              {row(child, index === linked.length - 1 ? "└" : "├")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
