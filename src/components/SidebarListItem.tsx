import type { ReactNode, Ref } from "react";
import { cn } from "../utils";

/** Keeps row status and actions aligned without nesting buttons inside a selector. */
export function SidebarListItem({
  label,
  selected,
  actions,
  children,
  ref,
}: {
  label: string;
  selected: boolean;
  actions: ReactNode;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div className="app-sidebar-row">
      <div
        ref={ref}
        role="group"
        aria-label={label}
        className={cn(
          "app-sidebar-item",
          selected && "app-sidebar-item-selected",
        )}
      >
        {children}
        <div className="app-sidebar-item-actions">{actions}</div>
      </div>
    </div>
  );
}
