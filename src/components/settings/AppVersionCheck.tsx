import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { checkAppUpdate, type AppUpdateInfo } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/error";
import { actionButtonClass } from "./settingsStyles";

type CheckState =
  | { status: "idle" | "checking" }
  | { status: "checked"; info: AppUpdateInfo }
  | { status: "error"; noRelease: boolean };

export function AppVersionCheck() {
  const { t } = useTranslation();
  const [state, setState] = useState<CheckState>({ status: "idle" });
  const [opening, setOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const check = async () => {
    if (busy.current) return;
    busy.current = true;
    setOpenFailed(false);
    setState({ status: "checking" });
    try {
      const info = await checkAppUpdate();
      if (mounted.current) setState({ status: "checked", info });
    } catch (error) {
      if (mounted.current)
        setState({
          status: "error",
          noRelease: getErrorMessage(error, "").includes(
            "APP_UPDATE_NO_RELEASE",
          ),
        });
    } finally {
      busy.current = false;
    }
  };
  const openRelease = async (url: string) => {
    if (busy.current) return;
    busy.current = true;
    setOpening(true);
    setOpenFailed(false);
    try {
      await openUrl(url);
    } catch {
      if (mounted.current) setOpenFailed(true);
    } finally {
      busy.current = false;
      if (mounted.current) setOpening(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void check()}
          disabled={state.status === "checking" || opening}
          className={`${actionButtonClass} border-accent-border bg-accent-bg text-accent-light`}
        >
          {state.status === "checking" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {t(
            state.status === "checking"
              ? "settings.checking"
              : "settings.checkUpdate",
          )}
        </button>
        {state.status === "checked" && state.info.has_update && (
          <button
            type="button"
            onClick={() => void openRelease(state.info.release_url)}
            disabled={opening}
            className={`${actionButtonClass} text-secondary`}
          >
            {opening ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ExternalLink className="h-3 w-3" />
            )}
            {t("settings.downloadRelease")}
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className="text-[12px] text-muted">
        {state.status === "checked" &&
          t(
            state.info.has_update
              ? "settings.updateAvailable"
              : "settings.noUpdate",
            { version: state.info.latest_version },
          )}
        {state.status === "error" &&
          t(
            state.noRelease
              ? "settings.noRelease"
              : "settings.updateCheckFailed",
          )}
        {openFailed && t("settings.releaseOpenFailed")}
      </p>
    </div>
  );
}
