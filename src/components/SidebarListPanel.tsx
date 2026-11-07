import type { ReactNode } from "react";
import { cn } from "../utils";

/** Shared list layout; callers own selection, editing and domain actions. */
export function SidebarListPanel({
  title,
  count,
  description,
  toolbar,
  footer,
  children,
  className,
}: {
  title: string;
  count?: number;
  description?: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      aria-label={title}
      className={cn("app-sidebar-list-panel", className)}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <h3 className="min-w-0 truncate font-semibold">{title}</h3>
        {count !== undefined && (
          <span className="shrink-0 text-muted">{count}</span>
        )}
      </div>
      {description && (
        <p className="text-xs leading-5 text-muted">{description}</p>
      )}
      {toolbar}
      <div className="app-sidebar-list">{children}</div>
      {footer && <div className="app-sidebar-footer">{footer}</div>}
    </aside>
  );
}
