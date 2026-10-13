import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { SettingsTabs } from "../components/settings/SettingsTabs";
import { AgentsSettings } from "../components/settings/AgentsSettings";
import { SkillsSettings } from "../components/settings/SkillsSettings";
import { AppearanceSettings } from "../components/settings/AppearanceSettings";
import { BackupNetworkSettings } from "../components/settings/BackupNetworkSettings";
import { AboutSettings } from "../components/settings/AboutSettings";
import { AppDataDirectorySetting } from "../components/settings/AppDataDirectorySetting";
import { SettingsAlerts } from "../components/settings/SettingsAlerts";
import { useSettingsDiagnostics } from "../components/settings/useSettingsDiagnostics";

export function Settings() {
  const { t } = useTranslation();
  const { tools } = useApp();
  const diagnostics = useSettingsDiagnostics();
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1040px] flex-1 flex-col">
      <header className="shrink-0 pb-3">
        <h1 className="app-page-title flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-accent" />
          {t("settings.title")}
        </h1>
        <p className="app-page-subtitle">{t("settings.subtitle")}</p>
      </header>
      <SettingsAlerts diagnostics={diagnostics} />
      <SettingsTabs agentCount={tools.filter((tool) => tool.installed).length}>
        {{
          agents: <AgentsSettings />,
          skills: <SkillsSettings />,
          appearance: <AppearanceSettings />,
          backup: <BackupNetworkSettings />,
          about: (
            <>
              <AboutSettings diagnostics={diagnostics} />
              <AppDataDirectorySetting />
            </>
          ),
        }}
      </SettingsTabs>
    </div>
  );
}
