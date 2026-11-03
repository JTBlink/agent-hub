import { useState } from "react";
import { useTranslation } from "react-i18next";
import { previewApi, type BrowserFrame } from "../api";
import { getErrorMessage } from "../../../lib/error";
export function PagePrompts({
  id,
  info,
  onError,
}: {
  id: string;
  info: BrowserFrame["info"];
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onError(getErrorMessage(error, t("common.error")));
    } finally {
      setBusy(false);
    }
  };
  if (info.dialog)
    return (
      <div
        className="preview-page-prompt"
        role="dialog"
        aria-label={t("preview.pageDialog")}
      >
        <strong>{t("preview.pageDialog")}</strong>
        <p>{info.dialog.message}</p>
        {info.dialog.type === "prompt" && (
          <input
            aria-label={t("preview.dialogResponse")}
            placeholder={info.dialog.defaultPrompt}
            value={prompt}
            maxLength={4000}
            onChange={(event) => setPrompt(event.target.value)}
          />
        )}
        <button
          disabled={busy}
          onClick={() =>
            void run(() =>
              previewApi.action(id, { kind: "handle_dialog", accept: false }),
            )
          }
        >
          {t("common.cancel")}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void run(() =>
              previewApi.action(id, {
                kind: "handle_dialog",
                accept: true,
                prompt: prompt || info.dialog?.defaultPrompt,
              }),
            )
          }
        >
          {t("common.confirm")}
        </button>
      </div>
    );
  if (info.chooser)
    return (
      <div className="preview-page-prompt" role="status">
        <strong>{t("preview.uploadFiles")}</strong>
        <p>{t("preview.uploadHint")}</p>
        <button
          disabled={busy}
          onClick={() =>
            void run(() =>
              previewApi.action(id, {
                kind: "cancel_upload",
                token: info.chooser!.token,
              }),
            )
          }
        >
          {t("common.cancel")}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void run(() =>
              previewApi.upload(
                id,
                info.revision,
                info.chooser!.token,
                info.chooser!.mode === "selectMultiple",
              ),
            )
          }
        >
          {t("preview.chooseFiles")}
        </button>
      </div>
    );
  return null;
}
