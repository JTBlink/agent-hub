import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  getSystemPermissions,
  openSystemPermissionSettings,
  type SystemPermission,
  type SystemPermissions,
} from "../../lib/systemPermissions";
import { getErrorMessage } from "../../lib/error";
import { actionButtonClass } from "./settingsStyles";
const permissions: SystemPermission[] = [
  "files_folders",
  "full_disk",
  "accessibility",
  "screen_capture",
];
export function PermissionSettings({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SystemPermissions>();
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<SystemPermission>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    const refresh = () => {
      void getSystemPermissions()
        .then((value) => {
          if (!disposed) {
            setStatus(value);
            setError("");
          }
        })
        .catch((cause: unknown) => {
          if (!disposed) setError(getErrorMessage(cause, t("common.error")));
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refresh);
    };
  }, [active, revision, t]);
  const open = async (permission: SystemPermission) => {
    if (opening) return;
    setOpening(permission);
    setError("");
    try {
      await openSystemPermissionSettings(permission);
    } catch (cause) {
      setError(getErrorMessage(cause, t("common.error")));
    } finally {
      setOpening(undefined);
    }
  };
  return (
    <section className="space-y-4" aria-label={t("settings.permissions.title")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {t("settings.permissions.title")}
        </h2>
        <button
          className={actionButtonClass}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={14} />
          {t("settings.permissions.refresh")}
        </button>
      </div>
      <p className="text-sm text-muted">{t("settings.permissions.intro")}</p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-secondary">
        {["step1", "step2", "step3"].map((key) => (
          <li key={key}>{t(`settings.permissions.${key}`)}</li>
        ))}
      </ol>
      {status && status.platform !== "macos" && (
        <p role="status" className="text-sm text-muted">
          {t("settings.permissions.otherPlatform")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {permissions.map((permission) => {
        const granted =
          permission === "accessibility" || permission === "screen_capture"
            ? status?.[permission]
            : null;
        return (
          <article key={permission} className="app-panel space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {t(`settings.permissions.${permission}.title`)}
              </h3>
              <span className="text-xs text-muted">
                {t(
                  `settings.permissions.${granted === true ? "granted" : granted === false ? "notGranted" : "checkInSettings"}`,
                )}
              </span>
            </div>
            <p className="text-sm text-secondary">
              {t(`settings.permissions.${permission}.description`)}
            </p>
            <button
              className={actionButtonClass}
              disabled={status?.platform !== "macos" || !!opening}
              onClick={() => void open(permission)}
            >
              <ExternalLink size={14} />
              {t("settings.permissions.open")}
            </button>
          </article>
        );
      })}
      <p className="text-xs text-muted">
        {t("settings.permissions.previewNote")}
      </p>
    </section>
  );
}
