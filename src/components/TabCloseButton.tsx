import type { ButtonHTMLAttributes } from "react";
import { X } from "lucide-react";
import { cn } from "../utils";

/** Compact close action shared by file and terminal tabs. */
export function TabCloseButton({
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      {...props}
      type="button"
      className={cn(
        "mr-1 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-sm text-secondary transition-colors hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      <X aria-hidden="true" size={14} strokeWidth={1.75} />
    </button>
  );
}
