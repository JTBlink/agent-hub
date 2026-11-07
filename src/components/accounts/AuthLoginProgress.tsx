import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TerminalPane, type PaneControl } from "../terminal/TerminalPane";
import type { TaskPlatform } from "../../integrations/platforms/types";
import * as api from "../../lib/tauri";
export function AuthLoginProgress({
  platform,
  host,
  verifying,
  createSession,
  onReady,
  onExit,
}: {
  platform: TaskPlatform;
  host: string;
  verifying: boolean;
  createSession: (
    size: api.TerminalSize,
    onEvent: (event: api.TerminalEvent) => void,
  ) => Promise<api.TerminalSession>;
  onReady: (control: PaneControl | null) => void;
  onExit: (code: number) => void;
}) {
  const { t } = useTranslation();
  const [challenge, setChallenge] = useState<{
    code: string;
    url: string;
    enterToOpen: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const control = useRef<PaneControl | null>(null);
  const continued = useRef(false);
  const screen = useCallback(
    (text: string) => {
      const next = platform.accounts.parseAuthChallenge?.(text, host);
      if (next)
        setChallenge((previous) =>
          previous?.code === next.code && previous.url === next.url
            ? previous
            : next,
        );
    },
    [platform, host],
  );
  const openAuthorization = async () => {
    if (!challenge) return;
    setError(false);
    try {
      if (challenge.enterToOpen && !continued.current && control.current) {
        await api.writeTerminal(control.current.sessionId, "\r");
        continued.current = true;
      } else await openUrl(challenge.url);
    } catch {
      setError(true);
    }
  };
  return (
    <div className="space-y-3">
      <p role="status" className="text-xs text-secondary">
        {t(
          verifying
            ? "accounts.verifying"
            : challenge
              ? "accounts.waitingAuthorization"
              : "accounts.followCli",
          { host },
        )}
      </p>
      {challenge && (
        <section
          aria-label={t("accounts.deviceCode")}
          className="space-y-3 rounded-lg border border-accent-border bg-background p-3"
        >
          <p className="text-xs text-muted">{t("accounts.deviceCodeHint")}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <code className="text-xl font-semibold tracking-widest text-primary">
              {challenge.code}
            </code>
            <button
              type="button"
              className="app-button-secondary gap-1.5"
              onClick={() =>
                void writeText(challenge.code)
                  .then(() => setCopied(true))
                  .catch(() => setError(true))
              }
            >
              <Copy size={14} aria-hidden="true" />
              {t(copied ? "accounts.codeCopied" : "accounts.copyCode")}
            </button>
          </div>
          <button
            type="button"
            className="app-button-primary gap-1.5"
            disabled={verifying}
            onClick={() => void openAuthorization()}
          >
            <ExternalLink size={14} aria-hidden="true" />
            {t("accounts.openAuthorization")}
          </button>
          <p className="break-all text-xs text-muted">{challenge.url}</p>
        </section>
      )}
      {error && (
        <p role="alert" className="text-xs text-warning">
          {t("common.error")}
        </p>
      )}
      <div className="h-64 overflow-hidden rounded-md border border-border-subtle p-2">
        <TerminalPane
          projectId="platform-account"
          createSession={createSession}
          active
          onReady={(value) => {
            control.current = value;
            onReady(value);
          }}
          onScreen={screen}
          onExit={onExit}
        />
      </div>
    </div>
  );
}
