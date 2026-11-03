import { useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FolderOpen, X } from "lucide-react";
import { previewApi, type PreviewDownload } from "../api";
import type { PreviewModel } from "../usePreviewWorkspace";
export function DownloadsPanel({ model }: { model: PreviewModel }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<PreviewDownload[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const report = useEffectEvent((error: unknown) => model.report(error));
  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const items = await previewApi.downloads();
        if (!disposed) setItems(items);
      } catch (error) {
        if (!disposed) report(error);
      } finally {
        if (!disposed) {
          setLoading(false);
          timer = window.setTimeout(() => void poll(), 1000);
        }
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, []);
  const run = async (item: PreviewDownload, action: () => Promise<unknown>) => {
    setBusy(item.id);
    try {
      await action();
    } catch (error) {
      model.report(error);
    } finally {
      setBusy(null);
    }
  };
  const bytes = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MiB`;
  return (
    <aside className="preview-inspector">
      <header>
        <h2>{t("preview.downloads")}</h2>
        <button
          aria-label={t("common.close")}
          onClick={() => model.setPanelOpen(false)}
        >
          <X size={16} />
        </button>
      </header>
      <div className="preview-inspector-scroll">
        {!items.length && (
          <p>{t(loading ? "common.loading" : "preview.noDownloads")}</p>
        )}
        {items.map((item) => (
          <article className="preview-note" key={`${item.profile}:${item.id}`}>
            <header>
              <strong title={item.name}>{item.name}</strong>
            </header>
            <p>
              {t(`preview.downloadState.${item.state}`, {
                defaultValue: item.state,
              })}{" "}
              · {bytes(item.received)}
              {item.total > 0 ? ` / ${bytes(item.total)}` : ""}
            </p>
            {item.state === "inProgress" ? (
              <button
                disabled={busy === item.id}
                onClick={() =>
                  void run(item, () =>
                    previewApi.cancelDownload(item.profile, item.id),
                  )
                }
              >
                {t("common.cancel")}
              </button>
            ) : item.state === "completed" && item.local ? (
              <div className="preview-note-actions">
                <button
                  disabled={busy === item.id}
                  onClick={() =>
                    void run(item, () =>
                      previewApi.openDownload(item.profile, item.id),
                    )
                  }
                >
                  <Download size={13} />
                  {t("common.open")}
                </button>
                <button
                  disabled={busy === item.id}
                  onClick={() =>
                    void run(item, () =>
                      previewApi.openDownload(item.profile, item.id, true),
                    )
                  }
                >
                  <FolderOpen size={13} />
                  {t("preview.revealDownload")}
                </button>
              </div>
            ) : null}
          </article>
        ))}
        <p>{t("preview.downloadHint")}</p>
      </div>
    </aside>
  );
}
