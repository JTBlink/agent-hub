import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, Save } from "lucide-react";
import * as api from "../../lib/tauri";
import { useSettingsForm } from "../../hooks/useSettingsForm";
import { SettingsForm } from "./SettingsForm";
import { actionButtonClass, fieldClass } from "./settingsStyles";

export function GitlabCliSettings() {
  const { t } = useTranslation();
  const [paths, setPaths] = useState("");
  const [settings, setSettings] = useState<api.GitlabCliSettings | null>(null);
  const [error, setError] = useState("");
  const form = useSettingsForm(api.getGitlabCliSettings, (value) => {
    setPaths(value.search_paths.join("\n"));
    setSettings(value);
  });
  const update = (save: boolean) =>
    form.save(async () => {
      setError("");
      try {
        const result = save
          ? await api.saveGitlabCliSettings(
              paths
                .split("\n")
                .map((path) => path.trim())
                .filter(Boolean),
            )
          : await api.getGitlabCliSettings();
        setSettings(result);
        if (save) setPaths(result.search_paths.join("\n"));
      } catch (cause) {
        setError(String(cause));
      }
    });
  return (
    <div className="mt-6">
      <SettingsForm form={form}>
        <section aria-labelledby="gitlab-cli-title">
          <h2 id="gitlab-cli-title" className="app-section-title mb-3">
            {t("settings.gitlabCli.title")}
          </h2>
          <div className="app-panel space-y-3 px-4 py-3">
            <div>
              <label
                htmlFor="gitlab-cli-paths"
                className="text-base font-semibold text-primary"
              >
                {t("settings.gitlabCli.paths")}
              </label>
              <p
                id="gitlab-cli-help"
                className="mt-0.5 mb-2 text-xs text-muted"
              >
                {t("settings.gitlabCli.help")}
              </p>
              <textarea
                id="gitlab-cli-paths"
                aria-describedby="gitlab-cli-help"
                rows={3}
                value={paths}
                onChange={(event) => setPaths(event.target.value)}
                placeholder={t("settings.gitlabCli.placeholder")}
                className={`${fieldClass} w-full resize-y font-mono text-xs`}
                spellCheck={false}
              />
            </div>
            <div role="status" className="text-xs text-secondary">
              <p>
                {settings?.path
                  ? t("settings.gitlabCli.found", {
                      source: t(
                        `settings.gitlabCli.sources.${settings.source}`,
                      ),
                    })
                  : t("settings.gitlabCli.missing")}
              </p>
              {settings?.path && (
                <p className="mt-1 break-all font-mono">{settings.path}</p>
              )}
            </div>
            <p className="text-xs text-muted">
              {t("settings.gitlabCli.fallback")}
            </p>
            {error && (
              <p role="alert" className="break-words text-xs text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void update(true)}
                disabled={form.saving}
                className={actionButtonClass}
              >
                {form.saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                {t("settings.gitlabCli.save")}
              </button>
              <button
                type="button"
                onClick={() => void update(false)}
                disabled={form.saving}
                className={actionButtonClass}
              >
                <RefreshCw className="h-3 w-3" />
                {t("settings.gitlabCli.detect")}
              </button>
            </div>
          </div>
        </section>
      </SettingsForm>
    </div>
  );
}
