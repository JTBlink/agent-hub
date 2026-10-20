import { GripVertical, Pencil, Trash2 } from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { useTranslation } from "react-i18next";
import type { SkillGroup } from "../lib/tauri";
import { getSkillGroupIconOption } from "../lib/skillGroupIcons";
import {
  getSkillGroupDisplayName,
  getSkillGroupDisplayDescription,
} from "../lib/skillGroupDisplay";
import { cn } from "../utils";

interface Props {
  group: SkillGroup;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  pending?: boolean;
}

export function SkillGroupNavigationRow({
  group,
  active,
  onSelect,
  onEdit,
  onDelete,
  dragHandleProps,
  pending,
}: Props) {
  const { t } = useTranslation();
  const name = getSkillGroupDisplayName(group.name, t);
  const description = getSkillGroupDisplayDescription(group, t);
  const option = getSkillGroupIconOption(group);
  const Icon = option.icon;
  const actionClass =
    "rounded p-1 text-muted hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40";

  return (
    <div
      className={cn(
        "group flex min-w-0 items-center rounded-md",
        active
          ? "bg-surface-active"
          : "hover:bg-surface-hover focus-within:bg-surface-hover",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        title={description ? `${name}\n${description}` : name}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-[7px] text-left text-sm leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          active
            ? "font-medium text-primary"
            : "text-tertiary hover:text-secondary",
        )}
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
            active
              ? `${option.activeClass} ${option.colorClass}`
              : "border-border bg-surface text-muted",
          )}
        >
          <Icon className="h-3 w-3" />
        </span>
        <span className="flex-1 truncate">{name}</span>
        {group.skill_count > 0 && (
          <span
            className={cn(
              "min-w-[18px] shrink-0 rounded-full px-1.5 text-center text-[12px] font-medium leading-[18px] tabular-nums",
              active
                ? "bg-accent-bg text-accent-light"
                : "bg-surface-hover text-muted",
            )}
          >
            {group.skill_count}
          </span>
        )}
      </button>
      <div
        className={cn(
          "flex shrink-0 items-center pr-1",
          "hidden group-hover:flex group-focus-within:flex",
        )}
      >
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            aria-label={t("sidebar.reorderGroup", { name })}
            className={`${actionClass} cursor-grab active:cursor-grabbing`}
          >
            <GripVertical className="h-3 w-3" />
          </div>
        )}
        <button
          type="button"
          onClick={onEdit}
          disabled={pending}
          aria-label={t("sidebar.editGroup", { name })}
          title={t("common.edit")}
          className={actionClass}
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          aria-label={t("sidebar.deleteGroup", { name })}
          title={t("common.delete")}
          className={`${actionClass} hover:text-danger`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
