import { Copy, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { TerminalTaskContext } from "../../lib/taskContext";

export function TerminalTaskContextPanel({
  context,
  onClose,
  onDismiss,
  onError,
}: {
  context: TerminalTaskContext;
  onClose: () => void;
  onDismiss: () => void;
  onError: (error: unknown) => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("tasks.context")}
      className="absolute bottom-7 right-3 z-20 flex max-h-[calc(50vh/var(--app-scale))] w-[480px] max-w-[90%] flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-card"
      onKeyDown={(event) => {
        if (event.key === "Escape") onDismiss();
      }}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs">{context.title}</span>
        <button
          type="button"
          aria-label={t("common.close")}
          className="app-button-ghost"
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </div>
      <textarea
        aria-label={t("tasks.context")}
        readOnly
        value={context.text}
        className="app-input min-h-32 flex-1 font-mono text-xs"
      />
      <button
        type="button"
        className="app-button-secondary self-start text-xs"
        onClick={() => void writeText(context.text).catch(onError)}
      >
        <Copy size={13} />
        {t("tasks.copy")}
      </button>
    </section>
  );
}
