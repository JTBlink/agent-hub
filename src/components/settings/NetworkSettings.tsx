import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useSettingsForm } from "../../hooks/useSettingsForm";
import * as api from "../../lib/tauri";
import { SettingsForm } from "./SettingsForm";
import { actionButtonClass, fieldClass } from "./settingsStyles";

export function NetworkSettings() {
  const { t } = useTranslation();
  const [proxy, setProxy] = useState("");
  const form = useSettingsForm(
    () => api.getSettings("proxy_url"),
    (value) => setProxy(value ?? ""),
  );
  const save = async () => {
    const value = proxy.trim();
    if (value && !/^(https?|socks5):\/\//i.test(value)) {
      toast.error(t("settings.proxyUrlInvalid"));
      return;
    }
    await form.save(async () => {
      await api.setSettings("proxy_url", value);
      setProxy(value);
      toast.success(t("settings.proxyUrlSaved"));
    });
  };
  return (
    <SettingsForm form={form}>
      <section aria-labelledby="network-proxy-title">
        <h2 id="network-proxy-title" className="app-section-title mb-3">
          {t("settings.proxyConfig")}
        </h2>
        <div className="app-panel px-4 py-3">
          <label
            htmlFor="network-proxy-url"
            className="text-base font-semibold text-primary"
          >
            {t("settings.proxyUrl")}
          </label>
          <p
            id="network-proxy-description"
            className="mt-0.5 mb-2 text-xs text-muted"
          >
            {t("settings.proxyUrlDesc")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="network-proxy-url"
              type="text"
              aria-describedby="network-proxy-description"
              value={proxy}
              onChange={(event) => setProxy(event.target.value)}
              placeholder={t("settings.proxyUrlPlaceholder")}
              className={`${fieldClass} min-w-0 flex-1 font-mono`}
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={form.saving}
              className={`${actionButtonClass} bg-surface-hover hover:bg-surface-active text-tertiary border-border`}
            >
              {form.saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              {t("common.save")}
            </button>
          </div>
        </div>
      </section>
    </SettingsForm>
  );
}
