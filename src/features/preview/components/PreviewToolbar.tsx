import {
  MousePointer2,
  Camera,
  Download,
  Code2,
  Save,
  Search,
  StopCircle,
  Clock,
  Terminal,
  Settings2,
  PanelRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PreviewModel } from "../usePreviewWorkspace";
export function PreviewToolbar({
  model,
  findOpen,
  setFindOpen,
  showPanel,
}: {
  model: PreviewModel;
  findOpen: boolean;
  setFindOpen: (open: boolean) => void;
  showPanel: (panel: PreviewModel["panel"]) => void;
}) {
  const { t } = useTranslation();
  const active = model.active;
  return (
    <div className="preview-toolbar">
      <div>
        <button
          disabled={!active || model.source}
          className={model.picking ? "active" : ""}
          onClick={() => model.setPicking(!model.picking)}
        >
          <MousePointer2 size={14} />
          {t("preview.pick")}
        </button>
        <button
          disabled={
            (!model.pageId && model.active?.kind !== "markdown") || model.busy
          }
          onClick={() => void model.screenshot()}
        >
          <Camera size={14} />
          {t("preview.screenshot")}
        </button>
        <button
          disabled={
            (!model.pageId && model.active?.kind !== "markdown") || model.busy
          }
          title={t("preview.fullScreenshot")}
          onClick={() => void model.screenshot(true)}
        >
          <Download size={14} />
          {t("preview.fullPage")}
        </button>
        <button
          disabled={!model.document}
          className={model.source ? "active" : ""}
          onClick={() => {
            model.setSource(!model.source);
            model.setPicking(false);
            model.setSourceLine(undefined);
          }}
        >
          <Code2 size={14} />
          {t("preview.source")}
        </button>
        {model.document && (
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
        </button>
      </div>
      <div>
        <button
          aria-label={t("preview.downloads")}
          title={t("preview.downloads")}
          onClick={() => showPanel("downloads")}
        >
          <Download size={14} />
        </button>
        <button
          aria-label={t("preview.stop")}
          title={t("preview.stop")}
          disabled={!model.pageId}
          onClick={() => void model.action({ kind: "stop" })}
        >
          <StopCircle size={14} />
        </button>
        <button
          aria-label={t("preview.history")}
          title={t("preview.history")}
          onClick={() => showPanel("history")}
        >
          <Clock size={14} />
        </button>
        <button
          aria-label={t("preview.developerTools")}
          title={t("preview.developerTools")}
          onClick={() => showPanel("tools")}
        >
          <Terminal size={14} />
        </button>
        <button
          aria-label={t("preview.settings")}
          title={t("preview.settings")}
          onClick={() => showPanel("settings")}
        >
          <Settings2 size={14} />
        </button>
        <button
          aria-label={t("preview.annotations")}
          title={t("preview.annotations")}
          className={model.panelOpen ? "active" : ""}
          onClick={() => {
            model.setPanel("annotations");
            model.setPanelOpen(!model.panelOpen);
          }}
        >
          <PanelRight size={14} />
        </button>
      </div>
    </div>
  );
}
