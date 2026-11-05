import { HerdrAgentSettings } from "./HerdrAgentSettings";
import { useTranslation } from "react-i18next";
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
      <HerdrAgentSettings />
    </SidebarSettingsPage>
  );
}
