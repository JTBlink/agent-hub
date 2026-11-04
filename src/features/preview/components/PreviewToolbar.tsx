import "@vscode/codicons/dist/codicon.css";
import { openPreviewAddress } from "../shared/documentLinks";
import {
  MousePointer2,
  Copy,
  Camera,
  Download,
  Code2,
  Save,
  Search,
  StopCircle,
  Clock,
  ExternalLink,
  Settings2,
  PanelRight,
  MoreVertical,
  Info,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCallback, type ReactNode } from "react";
import { CardActionMenu } from "../../../components/CardActionMenu";
import type { PreviewModel } from "../usePreviewWorkspace";
export function PreviewToolbar({
  model,
  findOpen,
  setFindOpen,
  showPanel,
  onAbout,
  children,
}: {
  children?: ReactNode;
  onAbout: () => void;
  model: PreviewModel;
  findOpen: boolean;
  setFindOpen: (open: boolean) => void;
  showPanel: (panel: PreviewModel["panel"]) => void;
}) {
  const { t } = useTranslation();
  const active = model.active;
  const focusFirstAction = useCallback((element: HTMLDivElement | null) => {
    element?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, []);
  return (
    <CardActionMenu
      label={t("common.more")}
      triggerIcon={<MoreVertical size={16} />}
      triggerClassName="preview-more-trigger"
      actions={[]}
      renderContent={(close) => (
        <div
          className="preview-workspace preview-tools-menu"
          ref={focusFirstAction}
          onKeyDown={(event) => {
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                ".preview-toolbar button:not(:disabled)",
              ),
            ];
            const index = items.findIndex((item) => item === event.target);
            if (index < 0) return;
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : event.key === "ArrowDown"
                    ? (index + 1) % items.length
                    : event.key === "ArrowUp"
                      ? (index - 1 + items.length) % items.length
                      : null;
            if (next === null) return;
            event.preventDefault();
            items[next]?.focus();
          }}
        >
          <div
            className="preview-toolbar"
            onClick={(event) => {
              if (
                (event.target as HTMLElement).closest("button:not(:disabled)")
              )
                close();
            }}
          >
            <div>
              <button
                disabled={
                  !active || model.source || (model.native && !model.pageId)
                }
                className={model.picking ? "active" : ""}
                onClick={() => model.setPicking(!model.picking)}
              >
                <MousePointer2 size={14} />
                {t("preview.pick")}
              </button>
            </div>
            <div>
              <button
                disabled={
                  (!model.pageId && model.active?.kind !== "markdown") ||
                  model.busy ||
                  model.source
                }
                onClick={() => void model.screenshot()}
              >
                <Camera size={14} />
                {t("preview.screenshot")}
              </button>
              <button
                disabled={
                  (!model.pageId && model.active?.kind !== "markdown") ||
                  model.busy ||
                  model.source
                }
                title={t("preview.fullScreenshot")}
                onClick={() => void model.screenshot(true)}
              >
                <Download size={14} />
                {t("preview.fullScreenshot")}
              </button>
              <button
                disabled={
                  (!model.pageId && active?.kind !== "markdown") ||
                  model.busy ||
                  model.source
                }
                title={t("preview.copyScreenshot")}
                aria-label={t("preview.copyScreenshot")}
                onClick={() => void model.screenshot(false, undefined, true)}
              >
                <Copy size={14} />
                {t("preview.copyScreenshot")}
              </button>
              <button
                disabled={
                  (!model.pageId && active?.kind !== "markdown") ||
                  model.busy ||
                  model.source
                }
                title={t("preview.copyFullScreenshot")}
                aria-label={t("preview.copyFullScreenshot")}
                onClick={() => void model.screenshot(true, undefined, true)}
              >
                <Copy size={14} />
                {t("preview.copyFullScreenshot")}
              </button>
            </div>
            <div>
              <button
                disabled={!model.document || model.document.kind === "resource"}
                className={`preview-source-toggle ${model.source ? "active" : ""}`}
                onClick={() => {
                  model.setSource(!model.source);
                  model.setPicking(false);
                  model.setSourceLine(undefined);
                }}
              >
                <Code2 size={14} />
                {t("preview.source")}
              </button>
              {model.document && model.document.kind !== "resource" && (
                <button
                  disabled={!model.dirty || model.busy}
                  onClick={() => void model.save()}
                >
                  <Save size={14} />
                  {t("common.save")}
                </button>
              )}
              <button
                aria-label={t("preview.find")}
                title={t("preview.find")}
                onClick={() => setFindOpen(!findOpen)}
              >
                <Search size={14} />
                {t("preview.find")}
              </button>
            </div>
            <div>
              <button
                aria-label={t("preview.downloads")}
                title={t("preview.downloads")}
                onClick={() => showPanel("downloads")}
              >
                <Download size={14} />
                {t("preview.downloads")}
              </button>
              <button
                aria-label={t("preview.stop")}
                title={t("preview.stop")}
                disabled={!model.pageId}
                onClick={() => void model.action({ kind: "stop" })}
              >
                <StopCircle size={14} />
                {t("preview.stop")}
              </button>
              <button
                aria-label={t("preview.history")}
                title={t("preview.history")}
                onClick={() => showPanel("history")}
              >
                <Clock size={14} />
                {t("preview.history")}
              </button>
              <button
                disabled={!active || !/^https?:/.test(active.address)}
                onClick={() => {
                  if (active)
                    void openPreviewAddress(active.address).catch(model.report);
                }}
              >
                <ExternalLink size={14} />
                {t("preview.openExternal")}
              </button>
              <button
                aria-label={t("preview.developerTools")}
                title={t("preview.developerTools")}
                disabled={!model.pageId}
                onClick={() => void model.openDevtools()}
              >
                <span
                  className="codicon codicon-developer-tools"
                  style={{ fontSize: 14 }}
                  aria-hidden="true"
                />
                {t("preview.developerTools")}
              </button>
              <button
                aria-label={t("preview.settings")}
                title={t("preview.settings")}
                onClick={() => showPanel("settings")}
              >
                <Settings2 size={14} />
                {t("preview.settings")}
              </button>
              <button
                aria-label={t("preview.annotations")}
                title={t("preview.annotations")}
                className={
                  model.panelOpen && model.panel === "annotations"
                    ? "active"
                    : ""
                }
                onClick={() => {
                  model.setPanel("annotations");
                  model.setPanelOpen(
                    !model.panelOpen || model.panel !== "annotations",
                  );
                }}
              >
                <PanelRight size={14} />
                {t("preview.annotations")}
              </button>
              <button onClick={onAbout}>
                <Info size={14} />
                {t("settings.about")}
              </button>
            </div>
          </div>
          {children}
        </div>
      )}
    />
  );
}
