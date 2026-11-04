import { Cloud } from "lucide-react";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import * as api from "../../lib/tauri";
import { getErrorMessage } from "../../lib/error";

/** Displays the existing Git service's actual state; owns no backup implementation. */
export function AgentLaunchBackup({
  revision,
  onSynced,
}: {
  revision?: string;
  onSynced: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<api.GitBackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    void api
      .gitBackupStatus()
      .then((next) => {
        if (active) {
          setStatus(next);
          setReadError("");
        }
      })
      .catch((e) => {
        if (active) setReadError(getErrorMessage(e, String(e)));
      });
    const unsubscribe = listen("backup-auto-completed", () => {
      if (active) {
        setGeneration((n) => n + 1);
        void onSynced();
      }
    });
    return () => {
      active = false;
      void unsubscribe.then((stop) => stop());
    };
  }, [revision, generation, onSynced]);
  const sync = async () => {
    setBusy(true);
    setError("");
    try {
      await api.gitBackupSync(t("agentLaunch.syncCommit"));
      setGeneration((n) => n + 1);
      await onSynced();
    } catch (e) {
      setError(getErrorMessage(e, String(e)));
    } finally {
      setBusy(false);
    }
  };
  const conflict = status?.changes.some(
    (change) => change.kind === "conflicted",
  );
  const pending =
    status?.upstream_health !== "healthy" ||
    status?.has_changes ||
    (status?.ahead ?? 0) > 0 ||
    (status?.behind ?? 0) > 0;
  const label = busy
    ? "syncing"
    : conflict
      ? "conflict"
      : error || readError
        ? "failed"
        : !status?.remote_url
          ? "local"
          : pending
            ? "pending"
            : "synced";
  return (
    <div className="mb-3 flex min-w-0 items-center gap-3 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm">
      <Cloud className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      <Link
        to="/backup"
        className="min-w-0 flex-1 truncate text-secondary hover:text-accent"
        title={`${t("agentLaunch.backup.details")}: ${t(`agentLaunch.backup.${label}`)}`}
        role="status"
      >
        {t(`agentLaunch.backup.${label}`)}
      </Link>
      <Link className="shrink-0 text-accent" to="/settings#backup">
        {t("agentLaunch.backup.settings")}
      </Link>
      <button
        type="button"
        className="app-button-secondary shrink-0 text-xs"
        disabled={busy || !status?.remote_url || !!conflict}
        onClick={() => void sync()}
      >
        {t("agentLaunch.backup.sync")}
      </button>
      {(error || readError) && (
        <span
          role="alert"
          className="max-w-48 truncate text-danger"
          title={error || readError}
        >
          {error || readError}
        </span>
      )}
    </div>
  );
}
