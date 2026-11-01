import { useTranslation } from "react-i18next";

export function TerminalStatus({
  message,
  notice,
  updateVersion,
  busy,
  onUpgrade,
}: {
  message: string;
  notice?: string;
  updateVersion?: string;
  busy: boolean;
  onUpgrade: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="flex min-h-5 min-w-0 flex-1 items-center gap-2 text-xs text-muted"
    >
      <span className="min-w-0 flex-1 truncate" title={notice}>
        {message}
      </span>
      {updateVersion && (
        <button
          type="button"
          className="text-accent-light"
          disabled={busy}
          onClick={onUpgrade}
        >
          {t("terminal.herdrUpdateAvailable", { version: updateVersion })}
        </button>
      )}
    </div>
  );
}
