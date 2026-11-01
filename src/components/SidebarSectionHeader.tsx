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
    <div className="border-y border-border-subtle bg-surface/40 px-1.5 first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        title={label}
        className="flex h-6 w-full min-w-0 items-center gap-1 text-left text-muted transition-colors hover:text-secondary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-faint" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-faint" />
        )}
        {icon}
        <span className="truncate text-xs font-semibold tracking-[0.01em]">
          {label}
        </span>
        {count !== undefined && (
          <span className="ml-auto text-xs font-medium tabular-nums text-faint">
            {count}
          </span>
        )}
      </button>
    </div>
  );
}
