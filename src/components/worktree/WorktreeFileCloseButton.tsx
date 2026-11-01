import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TabCloseButton } from "../TabCloseButton";
import { useWorktreeDocument } from "../../hooks/useWorktreeDocument";
import { SaveWorktreeChangesDialog } from "./SaveWorktreeChangesDialog";

export function WorktreeFileCloseButton({
  projectId,
  worktreePath,
  path,
  onClose,
}: {
  projectId: string;
  worktreePath: string;
  path: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const document = useWorktreeDocument(projectId, worktreePath, path);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      {document.dirty && (
        <span
          className="px-1 text-xs text-muted"
          role="status"
          aria-label={t("worktree.unsaved")}
        >
          ●
        </span>
      )}
      <TabCloseButton
        aria-label={t("fileReader.closeFile", { path })}
        title={t("fileReader.closeFile", { path })}
        disabled={document.saving}
        onClick={() => (document.dirty ? setConfirming(true) : onClose())}
      />
      {confirming && (
        <SaveWorktreeChangesDialog
          documents={[
            { key: JSON.stringify([projectId, worktreePath, path]), path },
          ]}
          onCancel={() => setConfirming(false)}
          onProceed={onClose}
        />
      )}
    </>
  );
}
