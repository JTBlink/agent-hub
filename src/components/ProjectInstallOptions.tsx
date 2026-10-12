import { useTranslation } from "react-i18next";

/** Project content stays central; teams choose how native entries are stored. */
export function ProjectInstallOptions({
  copy,
  busy,
  onChange,
}: {
  copy: boolean;
  busy: boolean;
  onChange: (copy: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <label className="mb-2 flex items-start gap-2 text-[12px] text-muted">
        <input
          type="checkbox"
          checked={copy}
          disabled={busy}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 accent-accent"
        />
        {t("projectLibrary.copyEntries")}
      </label>
      <p className="mb-2 text-[12px] text-muted">
        {t(
          copy
            ? "projectLibrary.installPlanCopy"
            : "projectLibrary.installPlan",
        )}
      </p>
    </>
  );
}
