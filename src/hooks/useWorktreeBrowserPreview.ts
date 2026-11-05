import { developmentPlan, startDevelopment } from "../lib/developmentPreview";
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
  const open = async (mode: "development" | "file" = "development") => {
    if (pending.current) return;
    if (hasPendingWorktreeDocument(projectId, worktreePath, path)) {
      throw new Error(t("fileTree.saveFirst"));
    }
    pending.current = true;
    setOpening(true);
    try {
      const plan =
        mode === "development" && /\.html?$/i.test(path)
          ? await developmentPlan(projectId, worktreePath, path)
          : null;
      if (plan && !plan.running) {
        const origin = await startDevelopment(projectId, worktreePath, plan);
        plan.url = new URL(new URL(plan.url).pathname, origin).href;
      }
      if (previews)
        await previews.open(projectId, worktreePath, path, plan?.url);
      else await openProjectPreview(projectId, worktreePath, path, plan?.url);
    } finally {
      pending.current = false;
      setOpening(false);
    }
  };
  return { open, openFile: () => open("file"), opening };
}
