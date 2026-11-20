import { useLocation, useNavigate } from "react-router-dom";
import { PermissionSettings } from "../components/settings/PermissionSettings";
import { HostsSettings } from "../components/settings/HostsSettings";
import { ArrowLeft, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { SettingsTabs } from "../components/settings/SettingsTabs";
import { AgentsSettings } from "../components/settings/AgentsSettings";
import { SkillsSettings } from "../components/settings/SkillsSettings";
import { AppearanceSettings } from "../components/settings/AppearanceSettings";
import { cloudSyncEnabled, BackupSettings } from "@app/cloud-sync";
import { NetworkSettings } from "../components/settings/NetworkSettings";
import { GitlabCliSettings } from "../components/settings/GitlabCliSettings";
import { gitlabEnabled } from "@app/platforms";
import { AboutSettings } from "../components/settings/AboutSettings";
import { AppDataDirectorySetting } from "../components/settings/AppDataDirectorySetting";
import { SettingsAlerts } from "../components/settings/SettingsAlerts";
import { useSettingsDiagnostics } from "../components/settings/useSettingsDiagnostics";
import { LogsSettings } from "../components/settings/LogsSettings";

export function Settings() {
  const { t } = useTranslation();
  const { hash, state } = useLocation();
  const navigate = useNavigate();
  const returnToEditor =
    state &&
    typeof state === "object" &&
    "automationSettingsReturn" in state &&
    state.automationSettingsReturn === true;
  const { tools } = useApp();
  const diagnostics = useSettingsDiagnostics();
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <header className="workbench-document-header shrink-0 mb-3">
        {returnToEditor && (
          <button
            type="button"
            className="app-button-ghost mb-2 text-sm"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
            {t("automation.backToEditor")}
          </button>
        )}
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
          backup: cloudSyncEnabled ? <BackupSettings /> : undefined,
          network: (
            <>
              <NetworkSettings />
              {gitlabEnabled && <GitlabCliSettings />}
            </>
          ),
          hosts: <HostsSettings active={hash === "#hosts"} />,
          permissions: <PermissionSettings active={hash === "#permissions"} />,
          about: (
            <>
              <AboutSettings diagnostics={diagnostics} />
              <AppDataDirectorySetting />
            </>
          ),
          logs: <LogsSettings />,
        }}
      </SettingsTabs>
    </div>
  );
}
