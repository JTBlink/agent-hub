import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { previewApi } from "../api";
import { nativeApi } from "../web/native/api";
import { getErrorMessage } from "../../../lib/error";
interface Info {
  engine: string;
  version?: string;
  userAgent?: string;
  protocol?: string;
}
/** Display data comes from the selected renderer, not browser executable discovery. */
export function KernelInfo({
  backend,
  pageId,
}: {
  backend: "native" | "chromium";
  pageId?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const key = `${backend}:${pageId ?? ""}`;
  const [result, setResult] = useState<{
    key: string;
    info?: Info;
    error?: string;
  }>();
  useEffect(() => {
    if (!open || (backend === "chromium" && !pageId)) return;
    let disposed = false;
    const request =
      backend === "native"
        ? nativeApi.info(pageId).then((info) => ({
            ...info,
            userAgent: info.userAgent || navigator.userAgent,
          }))
        : previewApi.kernel(pageId!).then((info) => ({
            engine: "Chromium",
            version: info.product,
            userAgent: info.userAgent,
            protocol: info.protocolVersion,
          }));
    void request
      .then((info) => {
        if (!disposed) setResult({ key, info });
      })
      .catch((error: unknown) => {
        if (!disposed)
          setResult({ key, error: getErrorMessage(error, t("common.error")) });
      });
    return () => {
      disposed = true;
    };
  }, [backend, pageId, key, open, t]);
  const current = result?.key === key ? result : undefined;
  return (
    <details
      className="preview-kernel"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>{t("settings.about")}</span>
      </summary>
      {open && (
        <div className="preview-kernel-details">
          <strong>
            {t(
              backend === "native"
                ? "preview.systemKernel"
                : "preview.chromiumKernel",
            )}
          </strong>
          <p>{t("preview.kernelInfo")}</p>

          {current?.error ? (
            <p role="alert">{current.error}</p>
          ) : current?.info ? (
            <dl>
              <dt>{t("preview.kernelEngine")}</dt>
              <dd>{current.info.engine}</dd>
              <dt>{t("preview.kernelVersion")}</dt>
              <dd>{current.info.version || t("preview.kernelUnknown")}</dd>
              <dt>User-Agent</dt>
              <dd>{current.info.userAgent || t("preview.kernelUnknown")}</dd>
              {current.info.protocol && (
                <>
                  <dt>CDP</dt>
                  <dd>{current.info.protocol}</dd>
                </>
              )}
            </dl>
          ) : (
            <p role="status">
              {t(
                backend === "chromium" && !pageId
                  ? "preview.kernelPending"
                  : "common.loading",
              )}
            </p>
          )}
        </div>
      )}
    </details>
  );
}
