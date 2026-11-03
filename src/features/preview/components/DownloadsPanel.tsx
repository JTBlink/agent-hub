import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FolderOpen, Trash2, X } from "lucide-react";
import { previewApi, type PreviewDownload } from "../api";
import type { PreviewModel } from "../usePreviewWorkspace";
export function DownloadsPanel({
  model,
}: {
  model: Pick<PreviewModel, "report" | "setPanelOpen">;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<PreviewDownload[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const runningAction = useRef(false);
  const report = useEffectEvent((error: unknown) => model.report(error));
  useEffect(() => {
    let disposed = false;
    mounted.current = true;
    let timer: number | undefined;
    const poll = async () => {
      const request = ++generation.current;
      try {
        const items = await previewApi.downloads();
        if (!disposed && request === generation.current) setItems(items);
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
      mounted.current = false;
      generation.current += 1;
      clearTimeout(timer);
    };
  }, []);
  const run = async (item: PreviewDownload, action: () => Promise<unknown>) => {
    if (runningAction.current) return;
    runningAction.current = true;
    setBusy(`${item.profile}:${item.id}`);
    generation.current += 1;
    try {
      await action();
      if (!mounted.current) return;
      const request = ++generation.current;
      const items = await previewApi.downloads();
      if (mounted.current && request === generation.current) setItems(items);
    } catch (error) {
      if (mounted.current) model.report(error);
    } finally {
      runningAction.current = false;
      if (mounted.current) setBusy(null);
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
        {items.map((item) => {
          const transferring =
            item.transfer?.state === "running" ||
            item.transfer?.state === "canceling";
          return (
            <article
              className="preview-note"
              key={`${item.profile}:${item.id}`}
            >
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
              <p>
                {t(
                  item.remote
                    ? "preview.remoteDownloadLocation"
                    : "preview.localDownloadLocation",
                )}
              </p>
              {item.remote && item.state === "completed" && !item.local && (
                <div>
                  <p>{t("preview.remoteDownloadPendingTransfer")}</p>
                  {item.transfer && (
                    <p role="status">
                      {t(`preview.transferState.${item.transfer.state}`)} ·{" "}
                      {bytes(item.transfer.received)}
                    </p>
                  )}
                  {item.transfer?.error && (
                    <p role="alert">
                      {t(`preview.transferError.${item.transfer.error}`, {
                        defaultValue: t("preview.transferError.failed"),
                      })}
                    </p>
                  )}
                  <button
                    disabled={
                      busy !== null || item.transfer?.state === "canceling"
                    }
                    onClick={() =>
                      void run(item, () =>
                        transferring
                          ? previewApi.cancelTransfer(item.profile, item.id)
                          : previewApi.fetchDownload(item.profile, item.id),
                      )
                    }
                  >
                    {t(
                      transferring ? "common.cancel" : "preview.fetchDownload",
                    )}
                  </button>
                </div>
              )}
              {item.remote && item.local && (
                <p role="status">{t("preview.transferState.completed")}</p>
              )}
              {item.state === "inProgress" && item.verified === false && (
                <p role="status">{t("preview.downloadUnverified")}</p>
              )}
              {item.state === "inProgress" ? (
                <button
                  disabled={busy !== null}
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
                    disabled={busy !== null}
                    onClick={() =>
                      void run(item, () =>
                        previewApi.openDownload(item.profile, item.id),
                      )
                    }
                  >
                    <Download size={13} />
                    {t("fileTree.open")}
                  </button>
                  <button
                    disabled={busy !== null}
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
              {["completed", "canceled", "interrupted"].includes(
                item.state,
              ) && (
                <button
                  disabled={busy !== null || transferring}
                  title={t("preview.removeDownloadHint")}
                  onClick={() =>
                    void run(item, () =>
                      previewApi.forgetDownload(item.profile, item.id),
                    )
                  }
                >
                  <Trash2 size={13} />
                  {t("preview.removeDownload")}
                </button>
              )}
            </article>
          );
        })}
        <p>{t("preview.downloadHint")}</p>
      </div>
    </aside>
  );
}
