import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { previewApi } from "../../api";
import { previewError } from "../../shared/previewError";

export function ChromiumError({
  error,
  id,
  profile,
  profileInUse,
  recovering,
  onRetry,
  onRecover,
}: {
  error: string;
  id: string | null;
  profile: string;
  profileInUse: boolean;
  recovering: "reconnect" | "reopen" | null;
  onRetry: () => void;
  onRecover: (mode: "reconnect" | "reopen") => void;
}) {
  const { t } = useTranslation();
  const [killing, setKilling] = useState(false);
  const [failure, setFailure] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setFailure("");
    setKilling(false);
    return () => {
      generation.current += 1;
    };
  }, [profile, error]);
  async function forceClose() {
    if (killing) return;
    const current = generation.current;
    setKilling(true);
    setFailure("");
    try {
      await previewApi.killProfileProcess(profile);
      if (generation.current === current) onRetry();
    } catch (error: unknown) {
      if (generation.current === current) setFailure(previewError(error, t));
    } finally {
      if (generation.current === current) setKilling(false);
    }
  }
  const busy = killing || recovering !== null;
  if (!id && profileInUse) {
    const message = failure || t("preview.profileBusy");
    return (
      <div
        role="alert"
        className="preview-browser-error preview-profile-conflict"
      >
        <p title={message}>{message}</p>
        <button
          className="app-button-secondary"
          title={t("preview.forceCloseHint")}
          disabled={busy}
          onClick={() => void forceClose()}
        >
          {t(killing ? "preview.forceClosing" : "common.retry")}
        </button>
      </div>
    );
  }
  return (
    <div role="alert" className="preview-browser-error">
      {id && <p>{t("preview.connectionUnverified")}</p>}
      <p>
        {error.includes("PREVIEW_BROWSER_NOT_FOUND")
          ? t("preview.missingBrowser")
          : error}
      </p>
      {id && <p>{t("preview.reconnectHint")}</p>}
      <button
        className="app-button-ghost"
        disabled={busy}
        onClick={() => (id ? onRecover("reconnect") : onRetry())}
      >
        {t(
          recovering === "reconnect"
            ? "preview.reconnecting"
            : id
              ? "preview.reconnect"
              : "common.retry",
        )}
      </button>
      {id && (
        <>
          <p>{t("preview.reopenHint")}</p>
          <button
            className="app-button-ghost"
            disabled={busy}
            onClick={() => onRecover("reopen")}
          >
            {t(
              recovering === "reopen" ? "preview.reopening" : "preview.reopen",
            )}
          </button>
        </>
      )}
    </div>
  );
}
