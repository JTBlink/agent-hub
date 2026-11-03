import { useState } from "react";
import { useTranslation } from "react-i18next";
import { nativeApi } from "./api";
import { getErrorMessage } from "../../../../lib/error";
export function NativeUserAgent({
  id,
  current,
  onApplied,
}: {
  id: string;
  current?: string;
  onApplied: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const apply = async (value?: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await nativeApi.userAgent(id, value);
      onApplied();
    } catch (error) {
      setError(getErrorMessage(error, t("common.error")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <label className="block">
        {t("preview.nativeUA")}
        <input
          className="w-full"
          aria-label={t("preview.nativeUA")}
          value={draft}
          maxLength={2048}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <p>{t("preview.nativeUAHint")}</p>
      <button
        disabled={busy || !draft.trim()}
        onClick={() => void apply(draft.trim())}
      >
        {t("common.apply")}
      </button>
      <button disabled={busy} onClick={() => void apply()}>
        {t("preview.nativeUAReset")}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
