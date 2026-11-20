import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { previewApi } from "../features/preview/api";
import { queuePreviewDocument } from "../features/preview/shared/openRequests";
import { getErrorMessage } from "../lib/error";
import type { ActiveCheckout } from "./useWorkspaceFiles";

/** Only explicit local paths become commands; ordinary search never reads disk. */
const absolutePath = /^(\/|~\/|[a-z]:[\\/]|\\\\)/i;

export function paletteFilePath(
  query: string,
  inWorkspace = false,
): string | null {
  let path = query.trim();
  if (
    (path.startsWith('"') && path.endsWith('"')) ||
    (path.startsWith("'") && path.endsWith("'"))
  ) {
    path = path.slice(1, -1);
  }
  if (absolutePath.test(path)) return path;
  // Treat a path with directory separators as explicit only when its base
  // checkout is known. Bare filenames and URLs remain search terms.
  return inWorkspace && /^[^:\\/]+(?:[\\/][^:\\/]+)+$/.test(path)
    ? path.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "")
    : null;
}

export function usePaletteFile(
  query: string,
  open: boolean,
  onOpened: () => void,
  checkout?: ActiveCheckout,
) {
  const { t } = useTranslation();
  const projectId = checkout?.projectId;
  const worktreePath = checkout?.worktreePath;
  const path = paletteFilePath(query, !!checkout);
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
  }, [query, open, projectId, worktreePath]);

  const openFile = async () => {
    if (!open || !path || inFlight.current) return;
    const request = lifetime.current;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const document =
        projectId && worktreePath && !absolutePath.test(path)
          ? await previewApi.openProject(projectId, worktreePath, path)
          : await previewApi.openDocument(path);
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
