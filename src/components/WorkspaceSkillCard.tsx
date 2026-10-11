import type { ReactNode } from "react";
import { FileText, Square, SquareCheck } from "lucide-react";
import { cn } from "../utils";

interface WorkspaceSkillCardTag {
  label: string;
  className: string;
}

interface WorkspaceSkillCardStatus {
  label: string;
  className: string;
}

export function WorkspaceSkillCard({
  viewMode,
  title,
  description,
  tags = [],
  status,
  fileCount = 0,
  active = false,
  actions,
  actionsHover = false,
  selectable = false,
  selected = false,
  onClick,
}: {
  viewMode: "grid" | "list";
  title: string;
  description?: string | null;
  tags?: WorkspaceSkillCardTag[];
  status: WorkspaceSkillCardStatus;
  fileCount?: number;
  active?: boolean;
  actions?: ReactNode;
  actionsHover?: boolean;
  /** Multi-select mode: the leading slot becomes a checkbox and clicks select. */
  selectable?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  const leadingSlot = selectable ? (
    selected ? (
      <SquareCheck className="h-3.5 w-3.5 text-accent" />
    ) : (
      <Square className="h-3.5 w-3.5 text-faint" />
    )
  ) : (
    <span
      className={cn(
        "h-2 w-2 rounded-full",
        active
          ? "bg-accent-light shadow-[0_0_0_3px_var(--color-accent-bg)]"
          : "bg-surface-active",
      )}
    />
  );
  if (viewMode === "list") {
    return (
      <div
        className={cn(
          "app-panel group relative flex cursor-pointer items-center gap-3.5 rounded-xl border-transparent px-3.5 py-3 transition-all hover:border-border hover:bg-surface-hover",
          selectable && selected && "ring-1 ring-accent border-accent/40",
        )}
        onClick={onClick}
      >
        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
          {leadingSlot}
        </div>
        <h3
          className="w-[180px] shrink-0 truncate text-[14px] font-semibold text-secondary group-hover:text-primary"
          title={title}
        >
          {title}
        </h3>
        <p className="min-w-0 flex-1 truncate text-[13px] text-muted">
          {description || "-"}
        </p>
        {tags.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag.label}
                className={cn(
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                  tag.className,
                )}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}
        <div className="flex min-w-0 max-w-[240px] items-center gap-2.5">
          <span
            title={status.label}
            className={cn(
              "min-w-0 truncate rounded-full px-2 py-0.5 text-[12px] font-medium",
              status.className,
            )}
          >
            {status.label}
          </span>
          {fileCount > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-[12px] text-faint">
              <FileText className="h-3 w-3" />
              {fileCount}
            </span>
          )}
        </div>
        {actions && (
          <div
            className={cn(
              "flex shrink-0 items-center gap-1",
              actionsHover &&
                "opacity-0 transition-opacity group-hover:opacity-100",
            )}
          >
            {actions}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "app-panel group relative flex h-full cursor-pointer flex-col overflow-hidden shadow-card transition-all hover:-translate-y-px hover:border-border hover:shadow-card-hover",
        selectable && selected && "ring-1 ring-accent border-accent/40",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-1.5">
        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
          {leadingSlot}
        </div>
        <h3
          className="flex-1 truncate text-[14px] font-semibold text-primary group-hover:text-accent-light"
          title={title}
        >
          {title}
        </h3>
        {fileCount > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-[12px] text-faint">
            <FileText className="h-3 w-3" />
            {fileCount}
          </span>
        )}
      </div>
      <div className="px-3.5 pb-3">
        <p className="truncate text-[13px] leading-[18px] text-muted">
          {description || "-"}
        </p>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {tags.map((tag) => (
              <span
                key={tag.label}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                  tag.className,
                )}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-faint px-3.5 py-2.5">
        <span
          title={status.label}
          className={cn(
            "min-w-0 truncate rounded-full px-2 py-0.5 text-[12px] font-medium",
            status.className,
          )}
        >
          {status.label}
        </span>
        {actions && (
          <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
        )}
      </div>
    </div>
  );
}
