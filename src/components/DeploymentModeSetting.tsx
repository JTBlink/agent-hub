import { useEffect, useState } from "react";
import { Copy, Link, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "../lib/tauri";
import { cn } from "../utils";

type Mode = "symlink" | "copy";
const validMode = (value: string | null): Mode | null =>
  value === "symlink" || value === "copy" ? value : null;

/** A saved unified default overrides legacy scope preferences only on selection. */
export function DeploymentModeSetting() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all([
      api.getSettings("deployment_mode"),
      api.getSettings("sync_mode"),
      api.getSettings("project_sync_mode"),
    ])
      .then(([unified, global, linked]) => {
        if (cancelled) return;
        const globalMode = validMode(global) ?? "symlink";
        const linkedMode = validMode(linked) ?? globalMode;
        setMode(
          validMode(unified) ??
            (globalMode === "symlink" && linkedMode === "symlink"
              ? "symlink"
              : null),
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const choose = async (next: Mode) => {
    setSaving(true);
    try {
      await api.setSettings("deployment_mode", next);
      setMode(next);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-semibold text-primary">
          {t("settings.deploymentMode")}
        </h3>
        <p className="mt-0.5 text-[12px] text-muted">
          {t("settings.deploymentModeDesc")}
        </p>
        {!loading && !error && mode === null && (
          <p className="mt-1 text-[12px] text-amber-600 dark:text-amber-400">
            {t("settings.deploymentModeLegacy")}
          </p>
        )}
        {error && (
          <div role="alert" className="mt-1 text-[12px] text-danger">
            {t("common.error")}
            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
              className="ml-2 underline"
            >
              {t("common.refresh")}
            </button>
          </div>
        )}
      </div>
      <div
        role="group"
        aria-label={t("settings.deploymentMode")}
        aria-busy={loading || saving}
        className="app-segmented flex-wrap bg-background"
      >
        {(["symlink", "copy"] as const).map((value) => {
          const Icon = value === "symlink" ? Link : Copy;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              disabled={loading || saving || error}
              onClick={() => void choose(value)}
              className={cn(
                "app-segmented-button inline-flex items-center justify-center gap-1.5 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border disabled:opacity-50",
                mode === value
                  ? "bg-surface-active text-secondary"
                  : "text-muted hover:text-tertiary",
              )}
            >
              {saving ? (
                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
              ) : (
                <Icon aria-hidden="true" className="h-3 w-3" />
              )}
              {t(`settings.${value}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
