import { useEffect, useId, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export function LocalImportErrorDialog({
  message,
  onClose,
}: {
  message: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (message && !dialog?.open) dialog?.showModal();
    else if (!message && dialog?.open) dialog.close();
  }, [message]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface p-5 text-primary shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <h2
        id={titleId}
        className="mb-3 flex items-center gap-2 text-[14px] font-semibold"
      >
        <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden="true" />
        {t("install.local.importFailed")}
      </h2>
      <p
        id={descriptionId}
        className="mb-5 text-[13px] leading-relaxed text-tertiary"
      >
        {message}
      </p>
      <form method="dialog" className="flex justify-end">
        <button className="app-button-primary">{t("common.confirm")}</button>
      </form>
    </dialog>
  );
}
