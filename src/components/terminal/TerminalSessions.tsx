import { useEffect, useId, useRef, useState } from "react";
import { List, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Project } from "../../lib/tauri";
import {
  TERMINAL_PANE_LIMIT,
  type TerminalTab,
} from "../../lib/terminalLayout";
import { compactHomePath, cn } from "../../utils";

export function TerminalSessions({
  tabs,
  projects,
  activeId,
  onSelect,
  onClose,
}: {
  tabs: TerminalTab[];
  projects: Project[];
  activeId: string;
  onSelect: (tab: TerminalTab) => void;
  onClose: (tab: TerminalTab) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const count = tabs.reduce((sum, tab) => sum + tab.panes.length, 0);
  const label = t("terminal.allSessions", {
    count,
    limit: TERMINAL_PANE_LIMIT,
  });
  return (
    <div
      ref={container}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        className="app-button-ghost h-7 gap-1.5 px-1.5 text-xs text-muted"
      >
        <List size={13} />
        {label}
      </button>
      {open && (
        <section
          id={id}
          aria-label={t("terminal.sessionsOverview")}
          className="absolute right-0 top-full z-30 mt-1 max-h-48 w-80 max-w-[calc(100vw/var(--app-scale)-2rem)] overflow-y-auto rounded border border-border bg-surface px-2 py-1 shadow-xl"
        >
          {!tabs.length && (
            <p className="px-2 py-1 text-xs text-muted">
              {t("terminal.noSessions")}
            </p>
          )}
          {tabs.map((tab) => {
            const project = projects.find((item) => item.id === tab.projectId);
            const path = compactHomePath(
              tab.worktreePath ?? project?.path ?? "",
            );
            const number =
              tabs
                .filter(
                  (item) =>
                    item.projectId === tab.projectId &&
                    item.worktreePath === tab.worktreePath,
                )
                .indexOf(tab) + 1;
            const name = `${project?.name ?? tab.projectId} · ${t("terminal.title")} ${number}`;
            return (
              <div
                key={tab.id}
                className={cn(
                  "flex items-center gap-2 rounded px-1",
                  tab.id === activeId && "bg-surface-active",
                )}
              >
                <button
                  type="button"
                  className="app-button-ghost min-w-0 flex-1 justify-start gap-2 px-1 py-1 text-left text-xs"
                  title={`${name}\n${path}`}
                  aria-label={t("terminal.goToSession", { name, path })}
                  onClick={() => {
                    onSelect(tab);
                    setOpen(false);
                    trigger.current?.focus();
                  }}
                >
                  <span className="min-w-0 max-w-[45%] truncate">{name}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {path}
                  </span>
                  <span className="shrink-0 text-muted">
                    {t("terminal.paneCount", { count: tab.panes.length })}
                  </span>
                </button>
                <button
                  type="button"
                  className="app-button-ghost h-6 w-6 shrink-0 p-0"
                  aria-label={t("terminal.closeSession", { name, path })}
                  onClick={() => {
                    onClose(tab);
                    trigger.current?.focus();
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
