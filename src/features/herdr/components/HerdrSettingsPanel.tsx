import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { ToggleSwitch } from "../../../components/ToggleSwitch";
import { SidebarSettingsPage } from "../../../components/SidebarSettingsPage";
import type { useHerdrFollowProject } from "../hooks/useHerdrFollowProject";

/** Herdr preferences stay inside its sidebar, alongside session controls. */
export function HerdrSettingsPanel({
  onBack,
  follow,
}: {
  onBack: () => void;
  follow: ReturnType<typeof useHerdrFollowProject>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <SidebarSettingsPage title={t("herdr.settings")} onBack={onBack}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-primary">
            {t("herdr.followProject")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {t("herdr.followProjectHelp")}
          </p>
        </div>
        <ToggleSwitch
          checked={follow.enabled}
          disabled={!follow.ready}
          loading={follow.saving}
          title={t("herdr.followProject")}
          onChange={() => void follow.change(!follow.enabled)}
        />
      </div>
      {follow.error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {t("herdr.settingsFailed")}
        </p>
      )}
      <div className="mt-4 rounded-lg border border-border-subtle bg-bg-secondary p-3">
        <p className="text-xs font-medium text-primary">
          {t("herdr.agentLaunch")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {t("herdr.agentLaunchHelp")}
        </p>
        <button
          type="button"
          className="app-button-secondary mt-2 inline-flex items-center gap-1.5 text-xs"
          onClick={() => navigate("/settings#agents")}
        >
          {t("terminal.agentSettings")}
          <ExternalLink size={12} aria-hidden="true" />
        </button>
      </div>
    </SidebarSettingsPage>
  );
}
