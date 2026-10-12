import { useTranslation } from "react-i18next";
import type { SkillGroup } from "../lib/tauri";
import { getSkillGroupDisplayName } from "../lib/skillGroupDisplay";
import { getSkillGroupIconOption } from "../lib/skillGroupIcons";
import { cn } from "../utils";

/** Keep each badge horizontal, wrapping complete badges when space is tight. */
export function ProjectSkillBadges({
  status,
  disabled,
  groups,
  activeGroupId,
  onGroupClick,
}: {
  status: { label: string; className: string };
  disabled: boolean;
  groups: SkillGroup[];
  activeGroupId?: string | null;
  onGroupClick?: (groupId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium",
          status.className,
        )}
      >
        {status.label}
      </span>
      {disabled && (
        <span className="shrink-0 whitespace-nowrap rounded-full bg-red-500/10 px-2 py-0.5 text-[12px] font-medium text-red-600 dark:text-red-300">
          {t("project.disabled")}
        </span>
      )}
      {groups.map((group) => {
        const option = getSkillGroupIconOption(group);
        const Icon = option.icon;
        const name = getSkillGroupDisplayName(group.name, t);
        const isActive = activeGroupId === group.id;
        const Tag = onGroupClick ? "button" : "span";
        return (
          <Tag
            key={group.id}
            title={name}
            onClick={
              onGroupClick
                ? (e: React.MouseEvent) => {
                    e.stopPropagation();
                    onGroupClick(group.id);
                  }
                : undefined
            }
            className={cn(
              "inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[11px] font-medium",
              isActive
                ? "ring-1 ring-accent border-accent"
                : "",
              option.activeClass,
              option.colorClass,
              onGroupClick && "cursor-pointer hover:opacity-80",
            )}
          >
            <Icon className="h-2.5 w-2.5 shrink-0" />
            <span className="min-w-0 max-w-[100px] truncate">{name}</span>
          </Tag>
        );
      })}
    </div>
  );
}
