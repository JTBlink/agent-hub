import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function SkillGroupContext({
  groupName,
  count,
}: {
  groupName?: string;
  count: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border-subtle px-1 pb-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <Layers className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="text-muted">{t("mySkills.membership.editing")}</span>
          {groupName ? (
            <>
              <strong className="break-all font-semibold text-secondary">
                {groupName}
              </strong>
              <span className="text-faint">
                {t("mySkills.membership.count", { count })}
              </span>
            </>
          ) : (
            <span className="text-secondary">
              {t("mySkills.membership.chooseGroup")}
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] leading-5 text-muted">
          {t("mySkills.membership.hint")}
        </p>
      </div>
      <Link
        to="/global-workspace"
        className="shrink-0 rounded text-[12px] text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {t("mySkills.membership.openWorkspace")}
      </Link>
    </div>
  );
}
