import { useSettingsForm } from "../../hooks/useSettingsForm";
import { SettingsForm } from "./SettingsForm";
import { Monitor, Moon, Sun, Type } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { useThemeContext } from "../../context/ThemeContext";
import type { Theme } from "../../hooks/useTheme";
import * as api from "../../lib/tauri";
import { applyTextSize } from "../../lib/textScale";
import { cn } from "../../utils";
import { segmentedButtonClass } from "./settingsStyles";

export function AppearanceSettings() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useThemeContext();
  const [closeAction, setCloseAction] = useState("");
  const [showTrayIcon, setShowTrayIcon] = useState(true);
  const [textSize, setTextSize] = useState("default");
  const form = useSettingsForm(
    () =>
      Promise.all([
        api.getSettings("close_action"),
        api.getSettings("show_tray_icon"),
        api.getSettings("text_size"),
      ]),
    ([close, tray, size]) => {
      setCloseAction(close ?? "");
      setShowTrayIcon(
        !["false", "0", "no", "off"].includes(
          (tray ?? "true").trim().toLowerCase(),
        ),
      );
      if (size) {
        setTextSize(size);
        applyTextSize(size);
      }
    },
  );
  const handleCloseActionChange = (action: string) =>
    form.save(async () => {
      if (action === "hide" && !showTrayIcon) return;
      await api.setSettings("close_action", action);
      setCloseAction(action);
    });
  const handleShowTrayIconChange = (enabled: boolean) =>
    form.save(async () => {
      await api.setSettings("show_tray_icon", enabled ? "true" : "false");
      setShowTrayIcon(enabled);
      if (!enabled && closeAction === "hide") {
        await api.setSettings("close_action", "close");
        setCloseAction("close");
      }
    });
  const handleLanguageChange = (lng: string) =>
    form.save(async () => {
      await api.setSettings("language", lng);
      localStorage.setItem("language", lng);
      await i18n.changeLanguage(lng);
    });
  const handleTextSizeChange = (size: string) =>
    form.save(async () => {
      await api.setSettings("text_size", size);
      setTextSize(size);
      applyTextSize(size);
    });
  const themeOptions: Array<{ value: Theme; label: string; icon: typeof Sun }> =
    [
      { value: "light", label: t("settings.themeLight"), icon: Sun },
      { value: "dark", label: t("settings.themeDark"), icon: Moon },
      { value: "system", label: t("settings.themeSystem"), icon: Monitor },
    ];
  return (
    <SettingsForm form={form}>
      <section>
        <h2 className="app-section-title mb-3">
          {t("settings.tabs.appearance")}
        </h2>
        <div className="app-panel overflow-hidden divide-y divide-border-faint">
          {/* Theme */}
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-semibold text-primary">
                {t("settings.theme")}
              </h3>
              <p className="mt-0.5 text-[12px] text-muted">
                {t("settings.themeDesc")}
              </p>
            </div>
            <div className="app-segmented flex-wrap bg-background">
              {themeOptions.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={cn(
                      segmentedButtonClass,
                      theme === opt.value
                        ? "bg-surface-active text-secondary"
                        : "text-muted hover:text-tertiary",
                    )}
                  >
                    <Icon className="w-3 h-3" /> {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Text size */}
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-semibold text-primary">
                {t("settings.textSize")}
              </h3>
              <p className="mt-0.5 text-[12px] text-muted">
                {t("settings.textSizeDesc")}
              </p>
            </div>
            <div className="app-segmented flex-wrap bg-background">
              {(
                [
                  { value: "small", label: t("settings.textSizeSmall") },
                  { value: "default", label: t("settings.textSizeDefault") },
                  { value: "large", label: t("settings.textSizeLarge") },
                  { value: "xlarge", label: t("settings.textSizeXLarge") },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleTextSizeChange(opt.value)}
                  className={cn(
                    segmentedButtonClass,
                    textSize === opt.value
                      ? "bg-surface-active text-secondary"
                      : "text-muted hover:text-tertiary",
                  )}
                >
                  {opt.value === "small" && <Type className="w-2.5 h-2.5" />}
                  {opt.value === "default" && <Type className="w-3 h-3" />}
                  {opt.value === "large" && <Type className="w-3.5 h-3.5" />}
                  {opt.value === "xlarge" && <Type className="w-4 h-4" />}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-semibold text-primary">
                {t("settings.language")}
              </h3>
            </div>
            <div className="app-segmented flex-wrap bg-background">
              {(
                [
                  { value: "zh", label: "简体中文" },
                  { value: "zh-TW", label: "繁體中文" },
                  { value: "en", label: "English" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleLanguageChange(opt.value)}
                  className={cn(
                    segmentedButtonClass,
                    i18n.language === opt.value
                      ? "bg-surface-active text-secondary"
                      : "text-muted hover:text-tertiary",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Close action */}
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-semibold text-primary">
                {t("settings.closeAction")}
              </h3>
              <p className="mt-0.5 text-[12px] text-muted">
                {t("settings.closeActionDesc")}
              </p>
              {!showTrayIcon && (
                <p className="text-[12px] text-muted mt-1">
                  {t("settings.trayIconOffHint")}
                </p>
              )}
            </div>
            <div className="app-segmented flex-wrap bg-background">
              {(["", "hide", "close"] as const).map((val) => (
                <button
                  key={val}
                  onClick={() => handleCloseActionChange(val)}
                  disabled={val === "hide" && !showTrayIcon}
                  className={cn(
                    segmentedButtonClass,
                    closeAction === val
                      ? "bg-surface-active text-secondary"
                      : "text-muted hover:text-tertiary",
                    val === "hide" &&
                      !showTrayIcon &&
                      "opacity-50 cursor-not-allowed hover:text-muted",
                  )}
                >
                  {t(`settings.closeAction_${val || "ask"}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Tray icon */}
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-semibold text-primary">
                {t("settings.trayIcon")}
              </h3>
              <p className="mt-0.5 text-[12px] text-muted">
                {t("settings.trayIconDesc")}
              </p>
            </div>
            <ToggleSwitch
              className="mt-1"
              checked={showTrayIcon}
              onChange={() => handleShowTrayIconChange(!showTrayIcon)}
              title={
                showTrayIcon
                  ? t("settings.trayIcon_on")
                  : t("settings.trayIcon_off")
              }
            />
          </div>
        </div>
      </section>
    </SettingsForm>
  );
}
