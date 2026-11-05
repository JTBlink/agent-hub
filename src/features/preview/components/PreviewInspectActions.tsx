import { MessageSquareText, SquareCode } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PreviewModel } from "../usePreviewWorkspace";

export function PreviewInspectActions({ model }: { model: PreviewModel }) {
  const { t } = useTranslation();
  const annotationsOpen = model.panelOpen && model.panel === "annotations";
  return (
    <>
      <button
        aria-label={t("preview.developerTools")}
        title={t("preview.developerTools")}
        aria-pressed={!!model.pageId && model.devtoolsPageId === model.pageId}
        disabled={!model.pageId}
        onClick={() => void model.openDevtools()}
      >
        <SquareCode size={16} aria-hidden="true" />
      </button>
      <button
        aria-label={t("preview.annotations")}
        title={t("preview.annotations")}
        aria-expanded={annotationsOpen}
        className={annotationsOpen ? "active" : ""}
        onClick={() => {
          model.setPanel("annotations");
          model.setPanelOpen(!annotationsOpen);
        }}
      >
        <MessageSquareText size={16} aria-hidden="true" />
      </button>
    </>
  );
}
