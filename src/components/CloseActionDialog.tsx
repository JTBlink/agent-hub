import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  busy?: boolean;
  trayEnabled?: boolean;
  onCancel: () => void;
  onClose: (remember: boolean) => void;
  onHide: (remember: boolean) => void;
}

export function CloseActionDialog({
  open,
  busy = false,
  trayEnabled = true,
  onCancel,
  onClose,
  onHide,
}: Props) {
  const { t } = useTranslation();
  const [remember, setRemember] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    hideRef.current?.focus();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [open]);

  const cancel = () => {
    if (busy) return;
    setRemember(false);
    onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm max-h-[calc(85vh/var(--app-scale))] overflow-y-auto rounded-xl border border-border bg-surface p-5 text-primary shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 id={titleId} className="text-sm font-semibold text-primary">
          {t("closeAction.title")}
        </h2>
        <button
          onClick={cancel}
          disabled={busy}
          aria-label={t("common.close")}
          className="app-button-ghost p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p id={messageId} className="text-sm text-tertiary mb-4">
        {t("closeAction.message")}
      </p>
      {!trayEnabled && (
        <p className="text-sm text-muted mb-4">
          {t("closeAction.enableTrayHint")}
        </p>
      )}
      <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={remember}
          disabled={busy}
          onChange={(event) => setRemember(event.target.checked)}
          className="w-3.5 h-3.5 accent-[var(--color-accent)]"
        />
        <span className="text-sm text-muted">{t("closeAction.remember")}</span>
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={cancel} disabled={busy} className="app-button-ghost">
          {t("common.cancel")}
        </button>
        <button
          onClick={() => onClose(remember)}
          disabled={busy}
          className="app-button-secondary"
        >
          {t("closeAction.close")}
        </button>
        <button
          ref={hideRef}
          onClick={() => onHide(remember)}
          disabled={busy}
          className="app-button-primary"
        >
          {t("closeAction.hide")}
        </button>
      </div>
    </dialog>
  );
}
