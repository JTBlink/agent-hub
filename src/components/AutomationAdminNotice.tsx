import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AutomationAdminNotice({ required }: { required?: boolean }) {
  const { t } = useTranslation();
  if (!required) return null;
  return (
    <aside
      role="note"
      className="flex items-start gap-2 rounded-lg border border-border-subtle bg-bg-secondary p-3 text-[12px] leading-6 text-secondary"
    >
      <ShieldCheck
        aria-hidden="true"
        className="mt-1 h-4 w-4 shrink-0 text-accent-light"
      />
      <p>{t("automation.adminAuthorizationHelp")}</p>
    </aside>
  );
}
