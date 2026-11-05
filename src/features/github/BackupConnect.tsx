import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Github, Loader2 } from "lucide-react";
import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorKind, getErrorMessage } from "../../lib/error";
import * as api from "../../lib/tauri";
import type { GithubBackupConnectProps } from "../../integrations/github-backup/contracts";
const DEFAULT_GITHUB_REPO = "agent-hub-backup";
const GITHUB_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo&description=Skills%20Manager%20Backup";
export function GithubBackupConnect({
  reconnect,
  busy,
  onBusyChange,
  onConnected,
  mapGitError,
}: GithubBackupConnectProps) {
  const { t } = useTranslation();
  const [connecting, setConnecting] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [githubRepoName, setGithubRepoName] = useState(DEFAULT_GITHUB_REPO);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [patMode, setPatMode] = useState(false);
  const [deviceInfo, setDeviceInfo] =
    useState<api.GithubDeviceFlowStart | null>(null);
  const deviceCancelRef = useRef(false);
  // Abandon an in-flight device-flow poll loop when leaving the page.
  useEffect(
    () => () => {
      deviceCancelRef.current = true;
    },
    [],
  );

  const mapGithubError = (error: unknown) => {
    const message = getErrorMessage(error, "");
    if (message.includes("GITHUB_TOKEN_INVALID"))
      return t("backup.github.errorToken");
    if (message.includes("GITHUB_SCOPE")) return t("backup.github.errorScope");
    if (message.includes("CREDENTIAL_STORE_UNAVAILABLE"))
      return t("backup.github.errorKeychain");
    if (message.includes("GITHUB_DEVICE_EXPIRED"))
      return t("backup.github.deviceExpired");
    if (message.includes("GITHUB_DEVICE_DENIED"))
      return t("backup.github.deviceDenied");
    if (
      message.includes("GITHUB_NETWORK") ||
      getErrorKind(error) === "network"
    ) {
      // §3.2: when github.com is unreachable, point at the PAT fallback too.
      return `${t("settings.gitErrorNetwork")} ${t("backup.github.deviceFallbackPat")}`;
    }
    return mapGitError(error);
  };

  const handleGithubConnect = async () => {
    const token = githubToken.trim();
    if (!token) return;
    setConnecting(true);
    onBusyChange(true);
    setGithubError(null);
    try {
      const res = await api.githubBackupConnect(
        token,
        githubRepoName.trim() || DEFAULT_GITHUB_REPO,
      );
      // Token is in the local credential store now; drop it from component state.
      setGithubToken("");
      await onConnected(res);
    } catch (error) {
      setGithubError(mapGithubError(error));
    } finally {
      setConnecting(false);
      onBusyChange(false);
    }
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const handleDeviceFlow = async () => {
    setConnecting(true);
    onBusyChange(true);
    setGithubError(null);
    deviceCancelRef.current = false;
    try {
      const info = await api.githubDeviceFlowStart();
      setDeviceInfo(info);
      void openUrl(info.verification_uri);

      const repoName = githubRepoName.trim() || DEFAULT_GITHUB_REPO;
      let intervalSec = Math.max(info.interval, 5);
      const deadline = Date.now() + info.expires_in * 1000;
      while (!deviceCancelRef.current && Date.now() < deadline) {
        await sleep(intervalSec * 1000);
        if (deviceCancelRef.current) return;
        const poll = await api.githubDeviceFlowPoll(info.device_code, repoName);
        if (poll.status === "slow_down") {
          intervalSec += 5;
          continue;
        }
        if (poll.status === "connected" && poll.result) {
          setDeviceInfo(null);
          await onConnected(poll.result);
          return;
        }
        // "pending" → keep polling.
      }
      if (!deviceCancelRef.current) {
        setGithubError(t("backup.github.deviceExpired"));
      }
    } catch (error) {
      setGithubError(mapGithubError(error));
    } finally {
      setDeviceInfo(null);
      setConnecting(false);
      onBusyChange(false);
    }
  };

  const cancelDeviceFlow = () => {
    deviceCancelRef.current = true;
    setDeviceInfo(null);
    setConnecting(false);
    onBusyChange(false);
  };

  return (
    <section className="app-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <Github className="h-4 w-4 text-muted" />
        <h2 className="text-base font-semibold text-secondary">
          {reconnect
            ? t("backup.github.reconnectTitle")
            : t("backup.github.title")}
        </h2>
      </div>
      <p className="mb-3 text-sm leading-5 text-muted">
        {t("backup.github.desc")}
      </p>

      {deviceInfo ? (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-2 rounded-md border border-border-subtle bg-bg-secondary px-4 py-4">
            <div className="font-mono text-3xl font-bold tracking-[0.25em] text-primary">
              {deviceInfo.user_code}
            </div>
            <button
              type="button"
              onClick={() => {
                void clipboardWriteText(deviceInfo.user_code);
                toast.success(t("backup.github.deviceCodeCopied"));
              }}
              className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-secondary"
            >
              <Copy className="h-3 w-3" />
              {t("backup.github.deviceCopyCode")}
            </button>
          </div>
          <p className="text-sm leading-5 text-muted">
            {t("backup.github.deviceWaitDesc", {
              uri: deviceInfo.verification_uri,
            })}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("backup.github.deviceWaiting")}
            </span>
            <button
              type="button"
              onClick={cancelDeviceFlow}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-tertiary transition-colors hover:bg-surface-hover hover:text-secondary"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDeviceFlow}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent-border bg-accent-dark px-3 text-sm font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Github className="h-3.5 w-3.5" />
              )}
              {connecting
                ? t("backup.github.connecting")
                : t("backup.github.deviceSignIn")}
            </button>
            <input
              type="text"
              value={githubRepoName}
              onChange={(event) => setGithubRepoName(event.target.value)}
              disabled={connecting}
              title={t("backup.github.repoLabel")}
              className="h-8 w-52 rounded-lg border border-border-subtle bg-background px-2.5 font-mono text-sm text-secondary outline-none transition-colors focus:border-border disabled:opacity-50"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {patMode ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={githubToken}
                  onChange={(event) => {
                    setGithubToken(event.target.value);
                    setGithubError(null);
                  }}
                  placeholder={t("backup.github.tokenPlaceholder")}
                  disabled={connecting}
                  className="h-8 min-w-0 flex-1 rounded-lg border border-border-subtle bg-background px-2.5 font-mono text-sm text-secondary outline-none transition-colors focus:border-border disabled:opacity-50"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={handleGithubConnect}
                  disabled={busy || !githubToken.trim()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-hover px-2.5 text-sm font-medium text-tertiary transition-colors hover:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("backup.github.connect")}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void openUrl(GITHUB_TOKEN_URL)}
                className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-secondary"
              >
                <ExternalLink className="h-3 w-3" />
                {t("backup.github.tokenHint")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setPatMode(true)}
              className="text-xs text-muted transition-colors hover:text-secondary"
            >
              {t("backup.github.patToggle")}
            </button>
          )}

          {githubError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-600 dark:text-red-300">
              {githubError}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
