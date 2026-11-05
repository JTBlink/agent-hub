import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TerminalSquare, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Project } from "../../lib/tauri";
import {
  TERMINAL_PANE_LIMIT,
  type TerminalTab,
} from "../../lib/terminalLayout";
import { compactHomePath, cn } from "../../utils";
import { getAppScale } from "../../lib/textScale";
import { herdrAgentLabel } from "@app/herdr";
import { terminalTabName } from "../../lib/terminalTabName";

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
  const panel = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const locate = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = getAppScale();
      const height =
        (panel.current?.getBoundingClientRect().height ?? 0) / scale;
      const width = (panel.current?.getBoundingClientRect().width ?? 0) / scale;
      const viewportWidth = window.innerWidth / scale;
      const viewportHeight = window.innerHeight / scale;
      setPosition({
        top: Math.max(
          8,
          Math.min(rect.bottom / scale + 4, viewportHeight - height - 8),
        ),
        right: Math.max(
          8,
          Math.min(
            (window.innerWidth - rect.right) / scale,
            viewportWidth - width - 8,
          ),
        ),
      });
    };
    locate();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(locate);
    if (panel.current) observer?.observe(panel.current);
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target) &&
        !panel.current?.contains(event.target)
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
        className="app-button-ghost h-7 shrink-0 gap-1.5 whitespace-nowrap px-1.5 text-xs text-muted"
      >
        <TerminalSquare size={16} aria-hidden="true" />
        <span className="tabular-nums" aria-hidden="true">
          {count}
        </span>
      </button>
      {open &&
        createPortal(
          <section
            ref={panel}
            style={position}
            id={id}
            aria-label={t("terminal.sessionsOverview")}
            className="fixed z-50 max-h-[min(28rem,calc(100vh/var(--app-scale)-2rem))] w-max max-w-[min(40rem,calc(100vw/var(--app-scale)-2rem))] overflow-y-auto rounded border border-border bg-surface px-2 py-1 shadow-xl"
          >
            {!tabs.length && (
              <p className="px-2 py-1 text-xs text-muted">
                {t("terminal.noSessions")}
              </p>
            )}
            {tabs.map((tab) => {
              const project = projects.find(
                (item) => item.id === tab.projectId,
              );
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
              const name = `${project?.name ?? tab.projectId} · ${terminalTabName(tab) ?? `${tab.agent ? herdrAgentLabel(tab.agent) : t("terminal.title")} ${number}`}`;
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
                    className="app-button-ghost min-w-0 flex-1 justify-start gap-3 px-2 py-2 text-left text-xs"
                    title={`${name}\n${path}`}
                    aria-label={t("terminal.goToSession", { name, path })}
                    onClick={() => {
                      onSelect(tab);
                      setOpen(false);
                      trigger.current?.focus();
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block whitespace-normal [overflow-wrap:anywhere]">
                        {name}
                        {tab.development && !tab.developmentVisible && (
                          <span className="ml-2 text-muted">
                            {t("fileTree.developmentBackground")}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block whitespace-normal text-muted [overflow-wrap:anywhere]">
                        {path}
                      </span>
                    </span>
                    <span className="shrink-0 text-muted">
                      {t("terminal.paneCount", { count: tab.panes.length })}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="app-button-ghost h-6 w-6 shrink-0 p-0"
                    aria-label={t(
                      tab.development
                        ? "fileTree.stopDevelopment"
                        : "terminal.closeSession",
                      { name, path },
                    )}
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
          </section>,
          document.body,
        )}
    </div>
  );
}
