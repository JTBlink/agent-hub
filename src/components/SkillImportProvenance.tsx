import { useTranslation } from "react-i18next";
import type { ManagedSkill } from "../lib/tauri";
import { isLocalSkillSource } from "../lib/skillUpdatePresentation";
import { compactHomePath } from "../utils";

/** Import origin is provenance, independent from the usable library copy. */
export function SkillImportProvenance({
  skill,
  busy,
  onRelink,
  onDetach,
}: {
  skill: Pick<ManagedSkill, "source_type" | "source_ref" | "update_status">;
  busy?: boolean;
  onRelink?: () => void;
  onDetach?: () => void;
}) {
  const { t } = useTranslation();
  if (!isLocalSkillSource(skill) || !skill.source_ref) return null;
  return (
    <div className="mb-4 rounded-lg border border-border-subtle px-3 py-2 text-[12px] text-muted">
      <p className="font-medium text-secondary">
        {t("mySkills.importProvenance.title")}
      </p>
      <p className="mt-1 break-all font-mono">
        {compactHomePath(skill.source_ref)}
      </p>
      <p className="mt-1">{t("mySkills.importProvenance.hint")}</p>
      {skill.update_status === "source_missing" && (onRelink || onDetach) && (
        <div className="mt-2 flex gap-2">
          {onRelink && (
            <button
              disabled={busy}
              onClick={onRelink}
              className="rounded border border-border-subtle px-2 py-1 hover:bg-surface-hover disabled:opacity-50"
            >
              {t("mySkills.updateActions.relink")}
            </button>
          )}
          {onDetach && (
            <button
              disabled={busy}
              onClick={onDetach}
              className="rounded border border-border-subtle px-2 py-1 hover:bg-surface-hover disabled:opacity-50"
            >
              {t("mySkills.updateActions.detachSource")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
