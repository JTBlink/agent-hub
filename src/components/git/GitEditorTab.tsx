import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { GitEditorTabsContext } from "../../hooks/gitEditorVisibility";
import { cn } from "../../utils";
import { TabCloseButton } from "../TabCloseButton";

/** Git editors share the workspace tab row, with a standalone fallback. */
export function GitEditorTab({
  label,
  title = label,
  detail,
  icon,
  closeLabel,
  onClose,
}: {
  label: string;
  title?: string;
  detail?: string;
  icon: ReactNode;
  closeLabel?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const shared = useContext(GitEditorTabsContext);
  const active = shared?.active ?? true;
  const close = closeLabel ?? t("common.close");
  const tab = (
    <div
      className={cn(
        "flex h-full shrink-0 items-center border-b-2",
        active ? "border-accent text-primary" : "border-transparent text-muted",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        title={title}
        onClick={() => shared?.onSelect()}
        className="flex h-full max-w-64 items-center gap-1.5 px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        {icon}
        <span className="truncate">{label}</span>
        {detail && <span className="shrink-0 text-muted">{detail}</span>}
      </button>
      <TabCloseButton aria-label={close} title={close} onClick={onClose} />
    </div>
  );
  return shared ? (
    shared.container && createPortal(tab, shared.container)
  ) : (
    <div
      role="tablist"
      className="flex h-9 shrink-0 items-center border-b border-border-subtle bg-bg-secondary"
    >
      {tab}
    </div>
  );
}
