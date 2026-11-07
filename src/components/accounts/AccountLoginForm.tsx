import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "../ThemedSelect";
export function AccountLoginForm({
  host: initialHost,
  lockedHost,
  busy,
  onLogin,
  onCancel,
}: {
  host: string;
  lockedHost: boolean;
  busy: boolean;
  onLogin: (host: string, token?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const initialFocus = useRef<HTMLInputElement>(null);
  useEffect(() => {
    initialFocus.current?.focus();
  }, []);
  const [host, setHost] = useState(initialHost);
  const [method, setMethod] = useState("cli");
  const [token, setToken] = useState("");
  return (
    <form
      className="space-y-3 rounded-lg border border-border-subtle p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const credential = method === "token" ? token : undefined;
        setToken("");
        void onLogin(host.trim(), credential);
      }}
    >
      <label className="block space-y-1 text-xs text-secondary">
        <span>{t("accounts.host")}</span>
        <input
          className="app-input w-full"
          ref={lockedHost ? undefined : initialFocus}
          value={host}
          required
          disabled={busy || lockedHost}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setHost(event.target.value)}
        />
      </label>
      <label className="block space-y-1 text-xs text-secondary">
        <span>{t("accounts.method")}</span>
        <ThemedSelect
          value={method}
          disabled={busy}
          onChange={(event) => {
            setMethod(event.target.value);
            setToken("");
          }}
        >
          <option value="cli">{t("accounts.cliLogin")}</option>
          <option value="token">{t("accounts.token")}</option>
        </ThemedSelect>
      </label>
      {method === "token" && (
        <label className="block space-y-1 text-xs text-secondary">
          <span>{t("accounts.token")}</span>
          <input
            className="app-input w-full"
            ref={lockedHost ? initialFocus : undefined}
            type="password"
            value={token}
            required
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            maxLength={16384}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
      )}
      <p className="text-xs text-muted">
        {t(
          method === "token" ? "accounts.credentialHint" : "accounts.authHint",
        )}
      </p>
      <div className="flex justify-end gap-2">
        <button
          className="app-button-ghost"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          {t("common.cancel")}
        </button>
        <button
          className="app-button-primary"
          type="submit"
          disabled={
            busy || !host.trim() || (method === "token" && !token.trim())
          }
        >
          {busy ? t("accounts.signingIn") : t("accounts.signIn")}
        </button>
      </div>
    </form>
  );
}
