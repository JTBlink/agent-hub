import { useTranslation } from "react-i18next";
import type { AutomationDraft } from "../lib/tauri";

export function AutomationVersionField({
  draft,
  onChange,
}: {
  draft: AutomationDraft;
  onChange: (value: Partial<AutomationDraft>) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="block space-y-2">
      <span className="text-[12px] font-medium text-muted">
        {t("automation.packageVersion")}
      </span>
      <input
        value={draft.package_options?.version ?? ""}
        maxLength={128}
        aria-label={t("automation.packageVersion")}
        placeholder={t("automation.unversioned")}
        className="app-input w-full font-mono text-[12px]"
        onChange={(event) =>
          onChange({
            package_options: {
              dependencies: draft.package_options?.dependencies ?? [],
              hermes: draft.package_options?.hermes ?? null,
              version: event.target.value || null,
            },
          })
        }
      />
      <span className="block text-[12px] leading-6 text-muted">
        {t("automation.packageVersionHelp")}
      </span>
    </label>
  );
}
