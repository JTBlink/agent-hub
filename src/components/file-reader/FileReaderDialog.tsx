import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Maximize2, Minimize2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FileReader } from "./FileReader";
import { cn } from "../../utils";
import type { FileReaderProps } from "./types";

/** Mount to open; unmount to close. Native modal keeps the host inert. */
export function FileReaderDialog({
  title,
  description,
  onClose,
  ...props
}: FileReaderProps & {
  title?: string;
  description?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [maximized, setMaximized] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    node?.showModal();
    node?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => {
      node?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      data-file-reader=""
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={cn(
        "m-auto max-h-[calc(100vh/var(--app-scale))] max-w-[calc(100vw/var(--app-scale))] overflow-hidden border border-border bg-surface p-0 text-primary shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm",
        maximized
          ? "h-[calc(100vh/var(--app-scale))] w-[calc(100vw/var(--app-scale))] rounded-none"
          : "h-[calc(90vh/var(--app-scale))] w-[calc(94vw/var(--app-scale))] rounded-xl",
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-secondary px-3 py-2">
          <BookOpen
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-accent-light"
          />
          <h2
            id={titleId}
            className="min-w-0 flex-1 truncate text-[13px] font-semibold"
            title={title}
          >
            {title ?? t("fileReader.title")}
          </h2>
          <button
            type="button"
            aria-label={t(
              maximized ? "fileReader.restore" : "fileReader.maximize",
            )}
            onClick={() => setMaximized(!maximized)}
            className="app-button-ghost shrink-0 p-2"
          >
            {maximized ? (
              <Minimize2 aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Maximize2 aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            data-initial-focus
            aria-label={t("common.close")}
            onClick={onClose}
            className="app-button-ghost shrink-0 p-2"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>
        <FileReader {...props} />
        {description && (
          <p
            id={descriptionId}
            className="shrink-0 border-t border-border-subtle bg-bg-secondary px-3 py-2 text-[11px] text-muted"
          >
            {description}
          </p>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
