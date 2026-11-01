import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  discardWorktreeDocument,
  saveWorktreeDocument,
} from "../../hooks/useWorktreeDocument";

export function SaveWorktreeChangesDialog({
  documents,
  onCancel,
  onProceed,
}: {
  documents: { key: string; path: string }[];
  onCancel: () => void;
  onProceed: () => void;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <ConfirmDialog
      open
      title={t("worktree.saveBeforeCloseTitle")}
      message={t("worktree.saveBeforeCloseMessage")}
      details={documents.map((doc) => doc.path)}
      confirmLabel={t("common.save")}
      tone="warning"
      onClose={onCancel}
      onConfirm={async () => {
        setSaving(true);
        setFailed(false);
        try {
          for (const doc of documents) {
            if (!(await saveWorktreeDocument(doc.key))) {
              setFailed(true);
              return false;
            }
          }
          onProceed();
          return false;
        } finally {
          setSaving(false);
        }
      }}
      secondaryAction={
        <button
          type="button"
          disabled={saving}
          className="app-button-secondary px-3 py-1.5 text-sm"
          onClick={() => {
            documents.forEach((doc) => discardWorktreeDocument(doc.key));
            onProceed();
          }}
        >
          {t("worktree.dontSave")}
        </button>
      }
    >
      {failed && (
        <p role="alert" className="text-sm text-danger">
          {t("worktree.saveBeforeCloseFailed")}
        </p>
      )}
    </ConfirmDialog>
  );
}
