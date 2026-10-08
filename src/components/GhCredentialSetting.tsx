import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "../lib/tauri";
import { ToggleSwitch } from "./ToggleSwitch";

const SETTING = "backup_use_gh";

export function GhCredentialSetting({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const value = await api.getSettings(SETTING);
      setEnabled(
        !["off", "false", "0", "no"].includes(
          (value ?? "").trim().toLowerCase(),
        ),
      );
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    if (enabled === null) return;
    setSaving(true);
    try {
      await api.setSettings(SETTING, enabled ? "off" : "on");
      setEnabled(!enabled);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-secondary">
            {t("backup.gh.title")}
          </h3>
          <p className="mt-1 text-[12px] leading-5 text-muted">
            {t("backup.gh.desc")}
          </p>
        </div>
        <ToggleSwitch
          className="mt-0.5"
          checked={enabled ?? false}
          loading={saving || (enabled === null && !loadFailed)}
          disabled={disabled || enabled === null}
          onChange={() => void toggle()}
          title={t("backup.gh.title")}
        />
      </div>
      {loadFailed && (
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 text-[12px] text-accent"
        >
          {t("backup.gh.loadFailed")}
        </button>
      )}
    </div>
  );
}
