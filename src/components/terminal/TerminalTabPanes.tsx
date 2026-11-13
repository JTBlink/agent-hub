import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  ComponentProps,
  CSSProperties,
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";
import { TerminalPane, type PaneControl } from "./TerminalPane";
import type { TerminalTab } from "../../lib/terminalLayout";
import { cn } from "../../utils";
export function TerminalTabPanes({
  tab,
  bounds,
  zoomedPane,
  visible,
  controls,
  activeTarget,
  setTabs,
  close,
  paneProps,
}: {
  tab: TerminalTab;
  bounds?: Record<string, CSSProperties>;
  zoomedPane: string;
  visible: boolean;
  controls: RefObject<Map<string, PaneControl>>;
  activeTarget: RefObject<PaneControl | null>;
  setTabs: Dispatch<SetStateAction<TerminalTab[]>>;
  close: (tab: TerminalTab, pane?: string) => void;
  paneProps: (
    tab: TerminalTab,
    pane: string,
  ) => Pick<
    ComponentProps<typeof TerminalPane>,
    "projectId" | "worktreePath" | "agent" | "herdrTarget"
  >;
}) {
  const { t } = useTranslation();
  return (
    <>
      {" "}
      {tab.panes.map((pane) => (
        <div
          key={pane}
          data-terminal-pane={pane}
          style={
            zoomedPane === pane
              ? { left: "0%", top: "0%", width: "100%", height: "100%" }
              : bounds?.[pane]
          }
          className={cn(
            "absolute flex flex-col min-h-0 min-w-0 overflow-hidden border",
            zoomedPane &&
              tab.panes.includes(zoomedPane) &&
              pane !== zoomedPane &&
              "hidden",
            tab.activePane === pane
              ? "border-accent-border"
              : "border-border-subtle",
          )}
          onFocusCapture={() =>
            setTabs((previous) =>
              previous.map((item) =>
                item.id === tab.id && item.activePane !== pane
                  ? { ...item, activePane: pane }
                  : item,
              ),
            )
          }
        >
          {tab.panes.length > 1 && (
            <button
              type="button"
              className="app-button-ghost absolute right-1 top-1 z-10"
              aria-label={t("terminal.closePane")}
              onClick={() => close(tab, pane)}
            >
              <X size={12} />
            </button>
          )}
          {tab.previewUncertain && !tab.previewPending && (
            <p role="alert" className="shrink-0 px-2 py-1 text-xs text-danger">
              {t("preview.agentUncertain")}
            </p>
          )}
          {tab.previewPending ? (
            <div role="status" className="p-3 text-xs text-muted">
              {t(
                tab.previewUncertain
                  ? "preview.agentUncertain"
                  : "common.loading",
              )}
            </div>
          ) : (
            <TerminalPane
              {...paneProps(tab, pane)}
              scriptPath={pane === tab.panes[0] ? tab.scriptPath : undefined}
              nativeTask={tab.nativeTask}
              nativeAgent={tab.nativeAgent}
              development={pane === tab.panes[0] ? tab.development : undefined}
              visible={
                visible &&
                (!tab.panes.includes(zoomedPane) || zoomedPane === pane)
              }
              active={
                visible &&
                tab.activePane === pane &&
                (!tab.panes.includes(zoomedPane) || zoomedPane === pane)
              }
              onReady={(control) => {
                if (control) {
                  controls.current.set(pane, control);
                  if (visible && tab.activePane === pane)
                    activeTarget.current = control;
                } else {
                  const previous = controls.current.get(pane);
                  controls.current.delete(pane);
                  if (activeTarget.current === previous)
                    activeTarget.current = null;
                }
              }}
            />
          )}
        </div>
      ))}
    </>
  );
}
