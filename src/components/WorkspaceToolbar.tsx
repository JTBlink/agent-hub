import type { ReactNode } from "react";

export function WorkspaceToolbar({
  children,
  context,
  actions,
}: {
  children: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-h-9 min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 pb-2">
      {children}
      {context}
      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-1 border-l border-border-subtle pl-2">
          {actions}
        </div>
      )}
    </header>
  );
}
