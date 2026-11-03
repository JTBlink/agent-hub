import { useState, type ComponentProps, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
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
  order,
  onReorder,
  reorderDisabled = false,
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
  order?: string[];
  onReorder?: (activeId: string, overId: string) => void;
  reorderDisabled?: boolean;
}) {
  const { roots, children } = groupHerdrWorkspaces(spaces);
  const orderedRoots = order
    ? [
        ...order.flatMap((id) =>
          roots.filter((space) => space.workspace_id === id),
        ),
        ...roots.filter((space) => !order.includes(space.workspace_id)),
      ]
    : roots;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id)
      onReorder?.(String(active.id), String(over.id));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={orderedRoots.map((space) => space.workspace_id)}
        strategy={verticalListSortingStrategy}
      >
        {orderedRoots.map((space) => (
          <SortableHerdrWorkspaceGroup
            key={space.workspace_id}
            space={space}
            session={session}
            onWorktreeDeleted={onWorktreeDeleted}
            linked={children.get(space.workspace_id) ?? []}
            agents={agents}
            selected={selected}
            disabled={disabled}
            onOpen={onOpen}
            project={projects.find(
              (project) => project.path === space.directory,
            )}
            onOpenWorktree={onOpenWorktree}
            sortable={!!onReorder && orderedRoots.length > 1}
            reorderDisabled={disabled || reorderDisabled}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableHerdrWorkspaceGroup({
  sortable,
  reorderDisabled,
  ...props
}: ComponentProps<typeof HerdrWorkspaceGroup> & {
  sortable: boolean;
  reorderDisabled: boolean;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.space.workspace_id,
    disabled: !sortable || reorderDisabled,
  });
  const dragHandle: ReactNode = sortable ? (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      data-herdr-workspace-drag={props.space.workspace_id}
      aria-disabled={reorderDisabled || undefined}
      className="app-button-ghost flex h-5 w-4 shrink-0 cursor-grab items-center justify-center rounded text-muted transition-colors hover:text-secondary focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      title={t("herdr.dragWorkspace", { name: props.space.label })}
      aria-label={t("herdr.dragWorkspace", { name: props.space.label })}
      onClick={(event) => event.stopPropagation()}
    >
      <GripVertical size={12} />
    </button>
  ) : null;
  return (
    <div
      ref={setNodeRef}
      data-herdr-workspace-group={props.space.workspace_id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
    >
      <HerdrWorkspaceGroup {...props} dragHandle={dragHandle} />
    </div>
  );
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
  dragHandle,
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
  dragHandle?: ReactNode;
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
        <div className="flex min-w-0 items-start">
          {dragHandle}
          <div
            className={linked.length ? "min-w-0 flex-1 pr-6" : "min-w-0 flex-1"}
          >
            {row(space)}
          </div>
        </div>
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
