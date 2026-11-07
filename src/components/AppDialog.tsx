import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";

/** Native modal supplies focus containment, Escape handling and focus restoration. */
export function AppDialog({
  title,
  busy = false,
  onClose,
  children,
  className,
  closeLabel,
  closeOnBackdrop = true,
  keepOpenOnWindowFocus = false,
}: {
  title: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  keepOpenOnWindowFocus?: boolean;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    node?.showModal();
    node?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    const restore = () => {
      if (
        keepOpenOnWindowFocus &&
        node?.isConnected &&
        !node.open &&
        document.visibilityState !== "hidden"
      )
        node.showModal();
    };
    if (keepOpenOnWindowFocus) {
      window.addEventListener("focus", restore);
      document.addEventListener("visibilitychange", restore);
    }
    return () => {
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", restore);
      node?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [keepOpenOnWindowFocus]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget && !busy)
          onClose();
      }}
      className={cn(
        // Explicit viewport positioning also centers native WebKit dialogs under CSS zoom.
        "fixed inset-auto left-[calc(50vw/var(--app-scale))] top-[calc(50vh/var(--app-scale))] m-0 -translate-x-1/2 -translate-y-1/2",
        "max-h-[calc(80vh/var(--app-scale))] w-[calc(100vw/var(--app-scale)-2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-5 text-primary shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={titleId} className="min-w-0 break-words text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={closeLabel ?? t("common.close")}
          className="app-button-ghost shrink-0 p-2"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
