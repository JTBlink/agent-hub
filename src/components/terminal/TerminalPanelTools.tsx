import {
  LayoutGrid,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeft,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CardActionMenu } from "../CardActionMenu";

interface Props {
  showTerminalActions?: boolean;
  hasTerminal: boolean;
  herdrBusy: boolean;
  hasUpdate: boolean;
  canSplit: boolean;
  maximized: boolean;
  onHerdr: () => void;
  onHerdrSidebar: () => void;
  onSplit: (direction: "horizontal" | "vertical") => void;
  onMaximize: () => void;
}

/** Compact panel controls; Herdr runs inside the selected terminal. */
export function TerminalPanelTools({
  showTerminalActions = true,
  hasTerminal,
  herdrBusy,
  hasUpdate,
  canSplit,
  maximized,
  onHerdr,
  onHerdrSidebar,
  onSplit,
  onMaximize,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-1">
      {showTerminalActions && (
        <>
          <button
            type="button"
            className="app-button-ghost h-7 shrink-0 gap-1 px-2 py-0 text-xs aria-disabled:opacity-50"
            // Keep native focus stable during preparation. Disabling the clicked
            // button can move focus to the WebView document and cancel launch.
            disabled={!hasTerminal}
            aria-disabled={!hasTerminal || herdrBusy}
            aria-busy={herdrBusy}
            onClick={() => {
              if (!herdrBusy) onHerdr();
            }}
            title={t("terminal.herdrLaunch")}
          >
            {herdrBusy && (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            )}
            Herdr{hasUpdate ? " •" : ""}
          </button>
          <button
            type="button"
            className="app-button-ghost h-7 w-7 shrink-0 p-0"
            aria-label={t("terminal.herdrSidebar")}
            title={`${t("terminal.herdrSidebar")} · Ctrl+B B`}
            disabled={!hasTerminal || herdrBusy}
            onClick={onHerdrSidebar}
          >
            <PanelLeft size={16} />
          </button>
          <CardActionMenu
            label={t("terminal.split")}
            disabled={!canSplit}
            triggerIcon={<LayoutGrid size={16} />}
            triggerClassName="h-7 w-7"
            actions={[
              {
                key: "horizontal",
                label: t("terminal.splitHorizontal"),
                onSelect: () => onSplit("horizontal"),
              },
              {
                key: "vertical",
                label: t("terminal.splitVertical"),
                onSelect: () => onSplit("vertical"),
              },
            ]}
          />
        </>
      )}
      <button
        type="button"
        className="app-button-ghost h-7 w-7 shrink-0 p-0"
        aria-label={t(
          `${showTerminalActions ? "terminal" : "fileReader"}.${maximized ? "restore" : "maximize"}`,
        )}
        title={t(
          `${showTerminalActions ? "terminal" : "fileReader"}.${maximized ? "restore" : "maximize"}`,
        )}
        onClick={onMaximize}
      >
        {maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
    </div>
  );
}
