import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  title?: string;
  message: string;
  details?: string[];
  children?: ReactNode;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  tone?: "danger" | "warning";
  onClose: () => void;
  /** Return false when the action failed and the dialog should stay open. */
  onConfirm: () => Promise<void | false>;
}

export function ConfirmDialog({
  open,
  title,
  message,
  details,
  children,
  confirmLabel,
  confirmDisabled = false,
  tone = "danger",
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const titleId = useId();
  const messageId = useId();
  const close = () => {
    if (!pending.current) onClose();
  };

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!pending.current) closeCallback.current();
      } else if (e.key === "Tab") {
        const buttons = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex='0']",
          ) ?? []),
        ];
        const first = buttons[0];
        const last = buttons.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    try {
      const confirmed = await onConfirm();
      if (confirmed !== false) onClose();
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  return (
    // The panel is capped so the footer buttons stay reachable (#430). The cap
    // divides by --app-scale because the text-size setting applies `zoom` to
    // <html> and zoom does not scale vh: a bare 85vh renders at 102% of the
    // viewport on the largest size. Same compensation as html/body in index.css.
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={close}
      />
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative bg-surface border border-border rounded-xl w-full max-w-sm p-5 shadow-2xl flex flex-col max-h-[calc(85vh/var(--app-scale))]"
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            id={titleId}
            className="text-[13px] font-semibold text-primary flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            {title || t("common.confirm")}
          </h2>
          <button
            onClick={close}
            disabled={loading}
            aria-label={t("common.close")}
            className="text-muted hover:text-secondary p-1 rounded transition-colors outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p id={messageId} className="text-[13px] text-tertiary mb-5">
          {message}
        </p>
        {details && details.length > 0 ? (
          <div className="mb-5 flex flex-wrap gap-2 overflow-y-auto min-h-0">
            {details.map((detail) => (
              <span
                key={detail}
                className="rounded-full border border-border-subtle bg-bg-secondary px-2.5 py-1 text-[13px] text-secondary"
              >
                {detail}
              </span>
            ))}
          </div>
        ) : null}

        {children && (
          <div className="mb-5 min-h-0 overflow-y-auto">{children}</div>
        )}

        <div className="flex justify-end gap-2">
          <button
            ref={cancel}
            onClick={close}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-tertiary hover:text-secondary hover:bg-surface-hover transition-colors outline-none"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || confirmDisabled}
            className={
              tone === "warning"
                ? "px-3 py-1.5 rounded-lg bg-accent-dark hover:bg-accent text-white text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-accent-border outline-none"
                : "px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-red-500/50 outline-none"
            }
          >
            {loading ? t("common.loading") : confirmLabel || t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
