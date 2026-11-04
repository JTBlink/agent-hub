import { useEffect, useEffectEvent, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { previewApi } from "../api";
import type { PreviewTab } from "../shared/session";
import { BrowserSurface } from "../web/BrowserSurface";

/** The inspector owns a separate renderer, while its socket targets the original page. */
export function DevtoolsDock({
  pageId,
  tab,
  active,
  onClose,
  onError,
}: {
  pageId: string;
  tab: PreviewTab;
  active: boolean;
  onClose: () => void;
  onError: (error: unknown) => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    let disposed = false;
    void previewApi
      .action<string>(pageId, { kind: "devtools" })
      .then((value) => {
        if (!disposed) setUrl(value);
      })
      .catch((error: unknown) => {
        if (!disposed) setError(error);
      });
    return () => {
      disposed = true;
    };
  }, [pageId]);
  const report = useEffectEvent(onError);
  useEffect(() => {
    if (error) report(error);
  }, [error]);
  return (
    <section
      className="preview-devtools"
      aria-label={t("preview.developerTools")}
    >
      <header>
        <span>{t("preview.developerTools")}</span>
        <button aria-label={t("common.close")} onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      {url ? (
        <BrowserSurface
          key={pageId}
          tabId={`devtools:${tab.id}`}
          active={active}
          address={url}
          profile={tab.profile}
          picking={false}
          viewport={null}
          onReady={() => {}}
          onFrame={() => {}}
          onCapture={() => {}}
          onError={onError}
        />
      ) : (
        !error && <p role="status">{t("common.loading")}</p>
      )}
    </section>
  );
}
