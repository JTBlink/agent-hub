import { Crosshair, MessageSquarePlus, PenTool } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PreviewModel } from "../usePreviewWorkspace";

export function PreviewQuickActions({
  model,
  disabled,
  onDraw,
}: {
  model: PreviewModel;
  disabled: boolean;
  onDraw: () => void;
}) {
  const { t } = useTranslation();
  const unavailable =
    disabled ||
    !model.active ||
    model.source ||
    (model.native && !model.pageId);
  return (
    <div
      className="preview-quick-actions"
      role="toolbar"
      aria-label={t("preview.quickActions")}
    >
      <button
        disabled={unavailable}
        aria-pressed={model.picking && model.pickIntent === "grab"}
        title={t("preview.grabElement")}
        onClick={() => model.beginPicking("grab")}
      >
        <Crosshair size={16} />
        {t("preview.grabElement")}
      </button>
      <button
        disabled={unavailable}
        aria-pressed={model.picking && model.pickIntent === "annotate"}
        title={t("preview.annotateElement")}
        onClick={() => model.beginPicking("annotate")}
      >
        <MessageSquarePlus size={16} />
        {t("preview.annotateElement")}
      </button>
      <button
        disabled={unavailable}
        title={t("preview.drawScreenshot")}
        onClick={onDraw}
      >
        <PenTool size={16} />
        {t("preview.drawScreenshot")}
      </button>
    </div>
  );
}
