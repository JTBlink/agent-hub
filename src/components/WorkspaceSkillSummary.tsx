import { useTranslation } from "react-i18next";
import { cn } from "../utils";

export function WorkspaceSkillSummary({
  total,
  managed,
  synced,
  onlyUnmanaged,
  onChange,
}: {
  total: number;
  managed: number;
  synced: number;
  onlyUnmanaged: boolean;
  onChange: (onlyUnmanaged: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>
        {t("globalWorkspace.localSkills.summary", { total, managed, synced })}
      </span>
      <button
        type="button"
        aria-pressed={onlyUnmanaged}
        title={t(
          onlyUnmanaged
            ? "globalWorkspace.localSkills.showAll"
            : "globalWorkspace.localSkills.showUnmanaged",
        )}
        onClick={() => onChange(!onlyUnmanaged)}
        className={cn(
          "rounded-full border px-2 py-0.5 text-[12px] transition-colors focus-visible:ring-2 focus-visible:ring-accent",
          onlyUnmanaged
            ? "border-accent-border bg-accent-bg text-accent"
            : "border-border-subtle text-muted hover:bg-surface-hover hover:text-secondary",
        )}
      >
        {t("globalWorkspace.localSkills.unmanagedCount", {
          count: total - managed,
        })}
      </button>
    </span>
  );
}
