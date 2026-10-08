import { useTranslation } from "react-i18next";
import { GhCredentialSetting } from "./GhCredentialSetting";
import { ToggleSwitch } from "./ToggleSwitch";

interface Props {
  disabled: boolean;
  autoBackupEnabled: boolean;
  autoBackupSaving: boolean;
  onToggleAutoBackup: () => void;
}

export function BackupPreferences({
  disabled,
  autoBackupEnabled,
  autoBackupSaving,
  onToggleAutoBackup,
}: Props) {
  const { t } = useTranslation();
  return (
    <section className="app-panel p-4">
      <h2 className="mb-3 text-[14px] font-semibold text-secondary">
        {t("backup.preferencesTitle")}
      </h2>
      <div className="divide-y divide-border-subtle">
        <div className="pb-4">
          <GhCredentialSetting disabled={disabled} />
        </div>
        <div className="flex items-start justify-between gap-3 pt-4">
          <div className="min-w-0">
            <h3 className="text-[13px] font-medium text-secondary">
              {t("backup.auto.title")}
            </h3>
            <p className="mt-1 text-[12px] leading-5 text-muted">
              {t("backup.auto.desc")}
            </p>
          </div>
          <ToggleSwitch
            className="mt-0.5"
            checked={autoBackupEnabled}
            loading={autoBackupSaving}
            onChange={onToggleAutoBackup}
            title={t("backup.auto.title")}
          />
        </div>
      </div>
    </section>
  );
}
