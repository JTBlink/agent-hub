import { useEffect, useId, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Shared full-sidebar settings surface: fixed back/header row and scrollable content. */
export function SidebarSettingsPage({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [returnTarget] = useState(() => document.activeElement);
  useEffect(
    () => () => {
      if (returnTarget instanceof HTMLElement && returnTarget.isConnected)
        returnTarget.focus();
    },
    [returnTarget],
  );
  return (
    <section
      aria-labelledby={titleId}
      className="flex h-full min-h-0 w-full flex-1 flex-col"
    >
      <header className="flex min-h-9 shrink-0 items-center gap-2 border-b border-border-subtle px-2 py-1">
        <button
          type="button"
          className="app-button-ghost rounded p-1 focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={t("common.back")}
          title={t("common.back")}
          onClick={onBack}
          autoFocus
        >
          <ArrowLeft size={15} />
        </button>
        <h2
          id={titleId}
          className="min-w-0 truncate text-xs font-semibold text-secondary"
          title={title}
        >
          {title}
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  );
}
