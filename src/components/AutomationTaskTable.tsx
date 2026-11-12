import type { ReactNode } from "react";
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
import { ChevronRight, Clock3, GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationTask, Project } from "../lib/tauri";
import {
  automationNextRun,
  automationProjectName,
  automationSchedule,
  automationTime,
} from "../lib/automation";
import { AutomationOriginBadge } from "./AutomationOriginBadge";
import { AutomationStatusBadge } from "./AutomationStatusBadge";
import { AutomationTaskIcon } from "./AutomationTaskIcon";
import { cn } from "../utils";

const columns = [
  "name",
  "schedule",
  "project",
  "host",
  "nextRun",
  "lastRun",
  "status",
  "source",
] as const;

export function AutomationTaskTable({
  tasks,
  projects,
  loading,
  emptyMessage,
  reorderDisabled,
  onOpen,
  onReorder,
  actions,
}: {
  tasks: AutomationTask[];
  projects: Project[];
  loading: boolean;
  emptyMessage: string;
  reorderDisabled: boolean;
  onOpen: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  actions: (task: AutomationTask) => ReactNode;
}) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id)
      onReorder(String(active.id), String(over.id));
  };
  return (
    <div
      aria-busy={loading}
      className="overflow-x-auto rounded-xl border border-border-subtle bg-surface"
    >
      <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
        <caption className="sr-only">{t("automation.title")}</caption>
        <thead className="border-b border-border-subtle bg-bg-secondary text-muted">
          <tr>
            {columns.map((key) => (
              <th key={key} scope="col" className="px-4 py-3 font-medium">
                {t(`automation.columns.${key}`)}
              </th>
            ))}
            <th scope="col">
              <span className="sr-only">{t("automation.details")}</span>
            </th>
          </tr>
        </thead>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tasks.map((task) => task.id)}
            strategy={verticalListSortingStrategy}
          >
            <tbody className="divide-y divide-border-subtle">
              {tasks.map((task) => (
                <AutomationTaskRow
                  key={task.id}
                  task={task}
                  projects={projects}
                  sortable={tasks.length > 1}
                  reorderDisabled={reorderDisabled}
                  onOpen={onOpen}
                  actions={actions(task)}
                />
              ))}
            </tbody>
          </SortableContext>
        </DndContext>
      </table>
      {!tasks.length && (
        <div className="flex flex-col items-center gap-3 px-5 py-14 text-center text-muted">
          <Clock3 aria-hidden="true" className="h-7 w-7" />
          <p className="text-sm">{t(emptyMessage)}</p>
        </div>
      )}
    </div>
  );
}

function AutomationTaskRow({
  task,
  projects,
  sortable,
  reorderDisabled,
  onOpen,
  actions,
}: {
  task: AutomationTask;
  projects: Project[];
  sortable: boolean;
  reorderDisabled: boolean;
  onOpen: (id: string) => void;
  actions: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !sortable || reorderDisabled });
  const description = task.definition?.description;
  return (
    <tr
      ref={setNodeRef}
      tabIndex={0}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
      className={cn(
        "group cursor-pointer transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        isDragging && "relative z-10 bg-surface-hover",
      )}
      onClick={(event) => {
        if ((event.target as Element).closest("button,a,input,select,textarea"))
          return;
        onOpen(task.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if ((event.target as Element).closest("button,a,input,select,textarea"))
          return;
        event.preventDefault();
        onOpen(task.id);
      }}
    >
      <td className="max-w-[320px] py-4 pl-2 pr-4">
        <div className="flex min-w-0 items-center gap-1">
          {sortable ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              data-automation-drag={task.id}
              aria-disabled={reorderDisabled || undefined}
              className="app-button-ghost flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted opacity-0 transition-opacity hover:text-secondary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent group-hover:opacity-100 active:cursor-grabbing aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              title={t("automation.dragTask", { name: task.name })}
              aria-label={t("automation.dragTask", { name: task.name })}
            >
              <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <button
            type="button"
            onClick={() => onOpen(task.id)}
            data-automation-id={task.id}
            className="flex w-full min-w-0 items-center gap-2.5 text-left text-sm font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            title={task.name}
          >
            <AutomationTaskIcon task={task} className="h-7 w-7" />
            <span className="min-w-0">
              <span className="block truncate">{task.name}</span>
              {description && (
                <span
                  className="mt-0.5 block truncate text-xs font-normal text-muted"
                  title={description}
                >
                  {description}
                </span>
              )}
              {task.origin !== "external" && (
                <AutomationOriginBadge origin={task.origin} />
              )}
            </span>
          </button>
        </div>
      </td>
      <td
        className="max-w-[190px] truncate px-4 py-4 text-tertiary"
        title={task.schedule}
      >
        {automationSchedule(task, t)}
      </td>
      <td
        className="max-w-[130px] truncate px-4 py-4 text-tertiary"
        title={task.project ?? undefined}
      >
        {automationProjectName(task.project, projects) || "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-tertiary">
        {t("automation.localHost")}
      </td>
      <td className="max-w-[170px] px-4 py-4 text-tertiary">
        {automationNextRun(task, i18n.language, t)}
      </td>
      <td className="max-w-[170px] px-4 py-4 text-tertiary">
        {automationTime(task.last_run, i18n.language) ||
          t("automation.unknown")}
        {task.last_result && (
          <span
            className={cn(
              "mt-1 block max-w-[160px] truncate text-xs",
              ["ok", "0"].includes(task.last_result)
                ? "text-accent-light"
                : ["skipped", "no_change"].includes(task.last_result)
                  ? "text-muted"
                  : "text-danger",
            )}
            title={task.last_result}
          >
            {["ok", "0"].includes(task.last_result)
              ? t("automation.runSucceeded")
              : task.last_result}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-4">
        <AutomationStatusBadge status={task.status} />
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-tertiary">
        {t(`automation.sources.${task.source}`)}
      </td>
      <td className="pr-3">
        <div className="flex items-center justify-end gap-1">
          {actions}
          <button
            type="button"
            onClick={() => onOpen(task.id)}
            aria-label={t("automation.viewTask", { name: task.name })}
            className="app-button-ghost rounded-md hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent p-1.5"
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
