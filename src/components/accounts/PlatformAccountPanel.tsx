import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Plus, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/tauri";
import type { TaskPlatform } from "../../integrations/platforms/types";
import type { PaneControl } from "../terminal/TerminalPane";
import { AuthLoginProgress } from "./AuthLoginProgress";
import { AccountLoginForm } from "./AccountLoginForm";

export function PlatformAccountPanel({
  platform,
  context,
  onChanged,
  onBusy,
  onForget,
}: {
  platform: TaskPlatform;
  context: api.PlatformAccountContext;
  onChanged: (
    target?: api.PlatformAccountTarget,
    accounts?: api.PlatformLoginAccount[],
  ) => Promise<void>;
  onBusy: (busy: boolean) => void;
  onForget: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [target] = useState<api.PlatformAccountTarget>(() => ({
    context_id: context.id,
    provider: context.provider,
    host: context.host,
  }));
  const [accounts, setAccounts] = useState<api.PlatformLoginAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [login, setLogin] = useState<api.PlatformAccountTarget | null>(null);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  const loginControl = useRef<PaneControl | null>(null);
  const changed = useRef(onChanged);
  changed.current = onChanged;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onBusy(busy || !!login);
    return () => onBusy(false);
  }, [busy, login, onBusy]);
  const requestVersion = useRef(0);
  const activeRequest = useRef<string | null>(null);
  const cancelRead = () => {
    requestVersion.current += 1;
    if (activeRequest.current)
      void api
        .cancelPlatformAccountQuery(activeRequest.current)
        .catch(() => {});
    activeRequest.current = null;
    setLoading(false);
  };
  useEffect(() => {
    let disposed = false;
    const version = ++requestVersion.current;
    const request = crypto.randomUUID();
    activeRequest.current = request;
    setLoading(true);
    setError("");
    setAccounts([]);
    void api
      .listPlatformAccounts(target, request)
      .then((values) => {
        if (!disposed && version === requestVersion.current)
          setAccounts(values);
      })
      .catch((reason) => {
        if (!disposed && version === requestVersion.current)
          setError(api.taskFailure(reason).kind);
      })
      .finally(() => {
        if (!disposed && version === requestVersion.current) {
          setLoading(false);
          activeRequest.current = null;
        }
      });
    return () => {
      disposed = true;
      void api.cancelPlatformAccountQuery(request).catch(() => {});
    };
  }, [target, revision]);
  const mutate = async (
    action: () => Promise<api.PlatformLoginAccount[]>,
    next = target,
  ) => {
    if (busy) return;
    cancelRead();
    setBusy(true);
    setError("");
    try {
      const values = await action();
      if (!mounted.current) return;
      setAccounts(values);
      setAdding(false);
      await changed.current(next, values);
      return true;
    } catch (reason) {
      if (mounted.current) setError(api.taskFailure(reason).kind);
      return false;
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  };
  const signIn = async (host: string, token?: string) => {
    const next = { ...target, host };
    if (token !== undefined) {
      await mutate(async () => {
        const values = await api.loginPlatformAccountToken(next, token);
        return values;
      }, next);
    } else {
      cancelRead();
      setLogin(next);
      setAdding(false);
      setError("");
    }
  };
  const createSession = useCallback(
    (size: api.TerminalSize, onEvent: (event: api.TerminalEvent) => void) => {
      if (!login) return Promise.reject(new Error("No account login selected"));
      return api.createPlatformAccountLogin(login, size, onEvent);
    },
    [login],
  );
  const loginExited = async (code: number) => {
    if (code !== 0) {
      setError("authentication");
      return;
    }
    const next = login ?? target;
    const verified = await mutate(async () => {
      const values = await api.listPlatformAccounts(next, crypto.randomUUID());
      if (!values.some((account) => account.active && account.authenticated))
        throw { kind: "authentication" };
      return values;
    }, next);
    if (verified && mounted.current) setLogin(null);
  };
  const blocked = busy || !!login;
  return (
    <div className="space-y-4" aria-busy={busy || loading}>
      {loading && (
        <p role="status" className="text-sm text-muted">
          {t("tasks.checkingIdentity")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-warning">
          {t(`tasks.errors.${error}`, { defaultValue: t("common.error") })}
        </p>
      )}
      {!loading && !accounts.length && !error && (
        <p className="text-sm text-muted">{t("accounts.empty")}</p>
      )}
      {!login && (
        <>
          <div className="space-y-2">
            {accounts.map((account) => (
              <div
                key={`${account.host}/${account.username}`}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-background p-3"
              >
                <platform.icon
                  aria-hidden="true"
                  className="h-7 w-7 shrink-0 text-secondary"
                />
                <div className="min-w-0 flex-1 break-words">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {account.active && account.authenticated && (
                      <CheckCircle2
                        size={14}
                        className="shrink-0 text-success"
                        aria-hidden="true"
                      />
                    )}
                    <span>@{account.username}</span>
                  </div>
                  <p className="text-xs text-muted">
                    {account.host} ·{" "}
                    {t(account.active ? "accounts.current" : "accounts.saved")}
                  </p>
                  {!account.authenticated && (
                    <p className="text-xs text-warning">
                      {t("accounts.expired")}
                    </p>
                  )}
                </div>
                {platform.accounts.switchMode === "saved" ? (
                  !account.active &&
                  account.switchable && (
                    <button
                      type="button"
                      className="app-button-secondary shrink-0"
                      disabled={blocked}
                      onClick={() => {
                        setSwitching(account.username);
                        void mutate(() =>
                          api.switchPlatformAccount(target, account.username),
                        ).finally(() => {
                          if (mounted.current) setSwitching(null);
                        });
                      }}
                    >
                      {t(
                        switching === account.username
                          ? "accounts.switching"
                          : "accounts.switch",
                      )}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="app-button-secondary shrink-0"
                    disabled={blocked}
                    onClick={() => setAdding(true)}
                  >
                    {t("accounts.switch")}
                  </button>
                )}
              </div>
            ))}
          </div>
          {platform.accounts.switchMode === "login" && (
            <p className="text-xs leading-relaxed text-muted">
              {t("accounts.gitlabSwitchHint")}
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted">
            {t("accounts.cliOwnsLogin", { cli: platform.accounts.cli })}
          </p>
        </>
      )}
      {adding && !login && (
        <AccountLoginForm
          host={target.host}
          lockedHost={context.project_scoped}
          busy={busy}
          onLogin={signIn}
          onCancel={() => setAdding(false)}
        />
      )}
      {login && (
        <div className="space-y-2">
          <AuthLoginProgress
            platform={platform}
            host={login.host}
            verifying={busy}
            createSession={createSession}
            onReady={(control) => {
              loginControl.current = control;
            }}
            onExit={(code) => void loginExited(code)}
          />
          <button
            type="button"
            className="app-button-secondary"
            disabled={busy}
            onClick={() => {
              const session = loginControl.current?.sessionId;
              setBusy(true);
              setLogin(null);
              void (async () => {
                try {
                  if (session) await api.closeTerminal(session);
                  if (!mounted.current) return;
                  setError("");
                  setRevision((value) => value + 1);
                  await changed.current();
                } catch {
                  if (mounted.current) setError("internal");
                } finally {
                  if (mounted.current) setBusy(false);
                }
              })();
            }}
          >
            {t("accounts.stopLogin")}
          </button>
        </div>
      )}
      {!login && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <button
            type="button"
            className="app-button-ghost gap-1.5"
            disabled={blocked || loading}
            onClick={() =>
              void changed
                .current(target)
                .then(() => {
                  if (mounted.current) setRevision((value) => value + 1);
                })
                .catch(() => {
                  if (mounted.current) setError("internal");
                })
            }
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t("tasks.refreshIdentity")}
          </button>
          <div className="flex gap-2">
            {context.remembered && (
              <button
                type="button"
                className="app-button-ghost"
                disabled={blocked}
                title={t("accounts.forgetHint")}
                onClick={() =>
                  void onForget().catch(() => setError("internal"))
                }
              >
                {t("accounts.forgetHost")}
              </button>
            )}
            <button
              type="button"
              className="app-button-secondary gap-1.5"
              disabled={blocked || adding}
              onClick={() => setAdding(true)}
            >
              <Plus size={14} aria-hidden="true" />
              {t("accounts.add")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
