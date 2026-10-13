import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function SidebarSectionHeader({
  label,
  isOpen,
  onToggle,
  icon,
  count,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  count?: number;
}) {
  return (
    <div className="mb-1.5 px-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full min-w-0 items-center gap-1.5 rounded py-1 text-left text-muted transition-colors hover:text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-faint" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-faint" />
        )}
        {icon}
        <span className="truncate text-[12px] font-semibold tracking-[0.01em]">
          {label}
        </span>
        {count !== undefined && (
          <span className="ml-auto text-[11px] font-medium tabular-nums text-faint">
            {count}
          </span>
        )}
      </button>
    </div>
  );
}
