import { useWorktreePreviews } from "./worktreePreviewsContext";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { hasPendingWorktreeDocument } from "./useWorktreeDocument";
import { openProjectPreview } from "../features/preview/shared/projectPreview";

/** Shared command for file-tree and editor preview actions. Callers own error presentation. */
export function useWorktreeBrowserPreview(
  projectId: string,
  worktreePath: string,
  path: string,
) {
  const { t } = useTranslation();
  const previews = useWorktreePreviews();
  const pending = useRef(false);
  const [opening, setOpening] = useState(false);
  const open = async () => {
    if (pending.current) return;
    if (hasPendingWorktreeDocument(projectId, worktreePath, path)) {
      throw new Error(t("fileTree.saveFirst"));
    }
    pending.current = true;
    setOpening(true);
    try {
      if (previews) await previews.open(projectId, worktreePath, path);
      else await openProjectPreview(projectId, worktreePath, path);
    } finally {
      pending.current = false;
      setOpening(false);
    }
  };
  return { open, opening };
}
