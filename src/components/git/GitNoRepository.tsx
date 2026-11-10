import { useTranslation } from "react-i18next";

export function GitNoRepository({
  busy,
  error,
  onInitialize,
}: {
  busy: boolean;
  error?: string;
  onInitialize: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 px-3 py-4 text-sm">
      <p className="text-muted">{t("git.noRepository")}</p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        className="app-button-primary w-full"
        disabled={busy}
        onClick={onInitialize}
      >
        {t(busy ? "git.initializingRepository" : "git.initializeRepository")}
      </button>
    </div>
  );
}
