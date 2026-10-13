import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { actionButtonClass } from "./settingsStyles";

export function SettingsForm({
  form,
  children,
}: {
  form: {
    loading: boolean;
    saving: boolean;
    failed: boolean;
    retry: () => Promise<void>;
  };
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4" aria-busy={form.loading || form.saving}>
      {form.loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-[13px] text-muted"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("common.loading")}
        </p>
      )}
      {form.failed && (
        <div
          role="alert"
          className="app-panel flex flex-wrap items-center justify-between gap-2 p-3 text-[13px] text-danger"
        >
          <span>{t("settings.loadFailed")}</span>
          <button
            type="button"
            onClick={() => void form.retry()}
            className={actionButtonClass}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      <fieldset
        disabled={form.loading || form.saving || form.failed}
        className="min-w-0 space-y-6"
      >
        {children}
      </fieldset>
    </div>
  );
}
