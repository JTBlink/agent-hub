import { useTranslation } from "react-i18next";
import { Plus, Globe, VenetianMask, FileText, FileCode2 } from "lucide-react";
import { TabCloseButton } from "../../../components/TabCloseButton";
import { CardActionMenu } from "../../../components/CardActionMenu";
import type { PreviewModel } from "../usePreviewWorkspace";

export function PreviewTabs({ model }: { model: PreviewModel }) {
  const { t } = useTranslation();
  return (
    <div className="preview-tabs" role="tablist" aria-label={t("preview.tabs")}>
      {model.session.tabs.map((tab) => (
        <div
          key={tab.id}
          className={tab.id === model.active?.id ? "active" : ""}
        >
          <button
            role="tab"
            aria-selected={tab.id === model.active?.id}
            onClick={() => model.select(tab.id)}
            title={tab.title}
          >
            {tab.kind === "markdown" ? (
              <FileText size={14} />
            ) : tab.kind === "html" ? (
              <FileCode2 size={14} />
            ) : (
              <Globe size={14} />
            )}
            <span>{tab.title}</span>
            {model.documents[tab.id] &&
              model.drafts[tab.id] !== model.documents[tab.id].content && (
                <span>●</span>
              )}
          </button>
          <TabCloseButton
            className="preview-tab-close"
            aria-label={t("preview.closeTab", { title: tab.title })}
            onClick={() => void model.close(tab.id)}
          />
        </div>
      ))}
      <PreviewNewTab model={model} />
    </div>
  );
}

export function PreviewNewTab({ model }: { model: PreviewModel }) {
  const { t } = useTranslation();
  return (
    <CardActionMenu
      className="preview-new-tab"
      label={t("preview.newTab")}
      align="start"
      triggerIcon={<Plus size={16} />}
      actions={[
        {
          key: "web",
          label: t("preview.newTab"),
          icon: <Globe size={14} />,
          onSelect: () => model.openWeb(),
        },
        {
          key: "native",
          label: t("preview.nativeBackend"),
          icon: <Globe size={14} />,
          onSelect: () => model.openWeb("about:blank", "native"),
        },
        {
          key: "guest",
          label: t("preview.newGuestTab"),
          icon: <VenetianMask size={14} />,
          onSelect: () => model.openWeb("about:blank", "guest"),
        },
      ]}
    />
  );
}
