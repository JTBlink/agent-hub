import { useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openHostsPermissionSettings } from "../../lib/hostsApi";
import { getErrorMessage } from "../../lib/error";
import { actionButtonClass } from "./settingsStyles";

export function HostsPermissionGuide() {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const open = async () => {
    if (pending.current) return;
    pending.current = true;
    setOpening(true);
    setError("");
    try {
      await openHostsPermissionSettings();
    } catch (cause) {
      const message = getErrorMessage(cause, t("common.error"));
      setError(
        t(
          message.includes("HOSTS_SETTINGS_UNAVAILABLE")
            ? "hosts.permissions.unavailable"
            : "hosts.permissions.openFailed",
          { message },
        ),
      );
    } finally {
      pending.current = false;
      setOpening(false);
    }
  };
  return (
    <aside
      aria-labelledby="hosts-permission-title"
      className="app-panel space-y-2 px-3 py-2 text-xs text-muted"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="hosts-permission-title" className="font-semibold text-primary">
          {t("hosts.permissions.title")}
        </h3>
        <button
          type="button"
          className={actionButtonClass}
          disabled={opening}
          onClick={() => void open()}
        >
          <ExternalLink className="h-3 w-3" />
          {t("hosts.permissions.open")}
        </button>
      </div>
      <p>{t("hosts.permissions.intro")}</p>
      {error && (
        <p role="alert" className="break-words text-danger">
          {error}
        </p>
      )}
    </aside>
  );
}
