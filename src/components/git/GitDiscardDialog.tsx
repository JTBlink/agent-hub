import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ConfirmDialog";

export function GitDiscardDialog({
  paths,
  error,
  onClose,
  onConfirm,
}: {
  paths?: string[];
  error?: string;
  onClose: () => void;
  onConfirm: () => Promise<void | false>;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={!!paths}
      title={t("git.discardChanges")}
      message={t("git.discardConfirm")}
      details={paths}
      confirmLabel={t("git.discardChanges")}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
