import { useSettingsForm } from "../../hooks/useSettingsForm";
import { SettingsForm } from "./SettingsForm";
import { ExternalLink, Link as LinkIcon, Loader2, Unlink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { SkillsDirectorySetting } from "../../components/SkillsDirectorySetting";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import * as api from "../../lib/tauri";
import { actionButtonClass, fieldClass } from "./settingsStyles";

export function BackupNetworkSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [gitRemoteInput, setGitRemoteInput] = useState("");
  const [gitRemoteSaving, setGitRemoteSaving] = useState(false);
  const [gitRemoteDisconnecting, setGitRemoteDisconnecting] = useState(false);
  const [gitEngineGit2, setGitEngineGit2] = useState(false);
  // Object merge is the default since 3d-β; "system" is the opt-out.
  const [gitMergeEngineObject, setGitMergeEngineObject] = useState(true);
  const [proxyInput, setProxyInput] = useState("");
  const [proxySaving, setProxySaving] = useState(false);
  const form = useSettingsForm(
    () =>
      Promise.all([
        api.getSettings("proxy_url"),
        api.getSettings("git_backup_remote_url"),
        api.getSettings("git_backup_engine"),
        api.getSettings("merge_engine"),
      ]),
    ([proxy, remote, git, merge]) => {
      setProxyInput(proxy ?? "");
      setGitRemoteInput(remote?.trim() || "");
      setGitEngineGit2(git?.trim() === "git2");
      setGitMergeEngineObject((merge ?? "").trim() !== "system");
    },
  );
  const handleSaveGitRemote = async () => {
    setGitRemoteSaving(true);
    try {
      // Credentials embedded in the URL go to the OS keychain; only the
      // sanitized URL is persisted (backup redesign §3.7).
      const trimmed = gitRemoteInput.trim();
      const effective = trimmed
        ? await api.gitBackupSanitizeRemoteUrl(trimmed)
        : "";
      await api.setSettings("git_backup_remote_url", effective);
      setGitRemoteInput(effective);
      toast.success(t("settings.gitConfigSaved"));
    } catch {
      toast.error(t("common.error"));
    } finally {
      setGitRemoteSaving(false);
    }
  };

  const handleDisconnectGitRemote = async () => {
    setGitRemoteDisconnecting(true);
    try {
      await api.gitBackupRemoveRemote();
      setGitRemoteInput("");
      toast.success(t("settings.gitDisconnected"));
    } catch {
      toast.error(t("common.error"));
    } finally {
      setGitRemoteDisconnecting(false);
    }
  };

  const handleSaveProxy = async () => {
    const trimmed = proxyInput.trim();
    if (trimmed && !/^(https?|socks5):\/\//i.test(trimmed)) {
      toast.error(t("settings.proxyUrlInvalid"));
      return;
    }
    setProxySaving(true);
    try {
      await api.setSettings("proxy_url", trimmed);
      toast.success(t("settings.proxyUrlSaved"));
    } catch {
      toast.error(t("common.error"));
    } finally {
      setProxySaving(false);
    }
  };
  return (
    <SettingsForm form={form}>
      <section>
        <h2 className="app-section-title mb-3">
          {t("settings.backupStorage")}
        </h2>
        <div className="app-panel px-5 py-4">
          <SkillsDirectorySetting backup />
        </div>
      </section>
      <section>
        <h2 className="app-section-title mb-3">
          {t("settings.gitSyncConfig")}
        </h2>
        <div className="app-panel overflow-hidden divide-y divide-border-faint">
          <div className="px-4 py-3">
            <h3 className="text-[14px] font-semibold text-primary">
              {t("settings.gitRemoteUrl")}
            </h3>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="mt-0.5 text-[12px] text-muted">
                {t("settings.gitSyncConfigDesc")}
                <span className="mt-1 block">
                  {t("settings.backupRecoveryHint")}
                </span>
              </p>
              <button
                type="button"
                onClick={() => navigate("/backup")}
                className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
              >
                <ExternalLink className="w-3 h-3" />
                {t("settings.openBackupPage")}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label={t("settings.gitRemoteUrl")}
                value={gitRemoteInput}
                onChange={(e) => setGitRemoteInput(e.target.value)}
                placeholder={t("settings.gitRemoteUrlPlaceholder")}
                className={`${fieldClass} min-w-0 flex-1 font-mono`}
              />
              <button
                onClick={() => void form.save(handleSaveGitRemote)}
                disabled={gitRemoteSaving}
                className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
              >
                {gitRemoteSaving ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <LinkIcon className="w-3 h-3" />
                )}
                {t("common.save")}
              </button>
              <button
                onClick={() => void form.save(handleDisconnectGitRemote)}
                disabled={gitRemoteDisconnecting}
                className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
              >
                {gitRemoteDisconnecting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Unlink className="w-3 h-3" />
                )}
                {t("settings.gitDisconnect")}
              </button>
            </div>
            <p className="text-[12px] text-muted mt-2">
              {t("settings.gitDisconnectHint")}
            </p>
            <details className="mt-4 border-t border-border-faint pt-3">
              <summary className="cursor-pointer text-[13px] font-medium text-secondary">
                {t("settings.advancedSettings")}
              </summary>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-primary">
                    {t("settings.gitEngineGit2")}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {t("settings.gitEngineGit2Desc")}
                  </p>
                </div>
                <ToggleSwitch
                  className="mt-1"
                  checked={gitEngineGit2}
                  title={t("settings.gitEngineGit2")}
                  onChange={() =>
                    form.save(async () => {
                      const next = !gitEngineGit2;
                      setGitEngineGit2(next);
                      try {
                        await api.setSettings(
                          "git_backup_engine",
                          next ? "git2" : "system",
                        );
                        toast.success(t("common.success"));
                      } catch {
                        setGitEngineGit2(!next);
                        toast.error(t("common.error"));
                      }
                    })
                  }
                />
              </div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-primary">
                    {t("settings.gitMergeEngineObject")}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {t("settings.gitMergeEngineObjectDesc")}
                  </p>
                </div>
                <ToggleSwitch
                  className="mt-1"
                  checked={gitMergeEngineObject}
                  title={t("settings.gitMergeEngineObject")}
                  onChange={() =>
                    form.save(async () => {
                      const next = !gitMergeEngineObject;
                      setGitMergeEngineObject(next);
                      try {
                        await api.setSettings(
                          "merge_engine",
                          next ? "object" : "system",
                        );
                        toast.success(t("common.success"));
                      } catch {
                        setGitMergeEngineObject(!next);
                        toast.error(t("common.error"));
                      }
                    })
                  }
                />
              </div>
            </details>
          </div>
        </div>
      </section>
      <section>
        <h2 className="app-section-title mb-3">{t("settings.proxyConfig")}</h2>
        <div className="app-panel overflow-hidden divide-y divide-border-faint">
          <div className="px-4 py-3">
            <h3 className="text-[14px] font-semibold text-primary">
              {t("settings.proxyUrl")}
            </h3>
            <p className="mt-0.5 mb-2 text-[12px] text-muted">
              {t("settings.proxyUrlDesc")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label={t("settings.proxyUrl")}
                value={proxyInput}
                onChange={(e) => setProxyInput(e.target.value)}
                placeholder={t("settings.proxyUrlPlaceholder")}
                className={`${fieldClass} min-w-0 flex-1 font-mono`}
              />
              <button
                onClick={() => void form.save(handleSaveProxy)}
                disabled={proxySaving}
                className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
              >
                {proxySaving ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <LinkIcon className="w-3 h-3" />
                )}
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      </section>
    </SettingsForm>
  );
}
