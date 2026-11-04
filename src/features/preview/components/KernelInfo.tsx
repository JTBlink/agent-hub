import { createPortal } from "react-dom";
import { useEffect, useState, useRef, useId, useEffectEvent } from "react";
import { useTranslation } from "react-i18next";
import { previewApi } from "../api";
import { NativeUserAgent } from "../web/native/NativeUserAgent";
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
  open,
  onClose,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus?: () => void;
  backend: "native" | "chromium";
  pageId?: string;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const restoreFocus = useEffectEvent(() => returnFocus?.());
  useEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    const previous = document.activeElement;
    node.showModal();
    return () => {
      node.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
      else restoreFocus();
    };
  }, [open]);
  const [refresh, setRefresh] = useState(0);
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
  }, [backend, pageId, key, open, refresh, t]);
  const current = result?.key === key ? result : undefined;
  if (!open) return null;
  return createPortal(
    <dialog
      ref={dialog}
      className="preview-kernel-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{t("settings.about")}</h2>
        <button
          autoFocus
          type="button"
          aria-label={t("common.close")}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="preview-kernel-details">
        <strong>
          {t(
            backend === "native"
              ? "preview.systemKernel"
              : "preview.chromiumKernel",
          )}
        </strong>
        <p>{t("preview.kernelInfo")}</p>
        {backend === "native" && pageId && current?.info && (
          <NativeUserAgent
            key={key}
            id={pageId}
            current={current.info.userAgent}
            onApplied={() => setRefresh((value) => value + 1)}
          />
        )}
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
    </dialog>,
    document.body,
  );
}
