import { Cloud } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function AutomationBackupNotice() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-lg border border-border-subtle bg-bg-secondary p-3 text-[12px] leading-5 text-muted">
      <Cloud aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">{t("automation.cloudBackupHelp")}</p>
      <Link
        to="/backup"
        className="shrink-0 text-accent-light hover:underline focus-visible:ring-2 focus-visible:ring-accent"
      >
        {t("automation.cloudBackupAction")}
      </Link>
    </div>
  );
}
