import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { previewApi } from "../features/preview/api";
import { queuePreviewDocument } from "../features/preview/shared/openRequests";
import { getErrorMessage } from "../lib/error";

/** Only explicit local paths become commands; ordinary search never reads disk. */
export function paletteFilePath(query: string): string | null {
  let path = query.trim();
  if (
    (path.startsWith('"') && path.endsWith('"')) ||
    (path.startsWith("'") && path.endsWith("'"))
  ) {
    path = path.slice(1, -1);
  }
  return /^(\/|~\/|[a-z]:[\\/]|\\\\)/i.test(path) ? path : null;
}

export function usePaletteFile(
  query: string,
  open: boolean,
  onOpened: () => void,
) {
  const { t } = useTranslation();
  const path = paletteFilePath(query);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lifetime = useRef({ active: false });
  const inFlight = useRef(false);

  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    setError("");
    setBusy(false);
    inFlight.current = false;
    return () => {
      current.active = false;
    };
  }, [query, open]);

  const openFile = async () => {
    if (!open || !path || inFlight.current) return;
    const request = lifetime.current;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const document = await previewApi.openDocument(path);
      if (!request.active) {
        await previewApi.closeDocument(document.id);
        return;
      }
      queuePreviewDocument(document);
      onOpened();
    } catch (error) {
      if (request.active) setError(getErrorMessage(error, t("common.error")));
    } finally {
      if (request.active) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };

  return { path, busy, error, openFile };
}
