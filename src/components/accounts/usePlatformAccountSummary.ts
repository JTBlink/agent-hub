import { useEffect, useRef, useState } from "react";
import * as api from "../../lib/tauri";
export interface AccountSummary extends api.PlatformLoginAccount {
  provider: api.TaskProvider;
}
export interface AccountContextSummary {
  context: api.PlatformAccountContext;
  accounts: api.PlatformLoginAccount[];
  status: "checking" | "authenticated" | "signed_out" | "unavailable";
}
export const accountContextKey = (context: api.PlatformAccountContext) =>
  `${context.id}@${context.host}`;
const targetKey = (target: api.PlatformAccountTarget) =>
  `${target.context_id}@${target.host}`;
/** One bounded snapshot shared by the account entry and dialog. Verified writes win over pending reads. */
export function usePlatformAccountSummary(refreshKey: number, enabled = true) {
  const [contexts, setContexts] = useState<AccountContextSummary[]>([]);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const verified = useRef(new Map<string, AccountContextSummary>());
  useEffect(() => {
    if (!enabled) return;
    verified.current.clear();
    let disposed = false;
    const pending = new Set<string>();
    setError(false);
    void (async () => {
      const values = await api.getPlatformAccountContexts();
      if (disposed) return;
      const summaries: AccountContextSummary[] = (
        Array.isArray(values) ? values : []
      ).map(
        (context) =>
          verified.current.get(accountContextKey(context)) ?? {
            context,
            accounts: [],
            status: "checking",
          },
      );
      for (const [key, entry] of verified.current)
        if (
          !summaries.some((value) => accountContextKey(value.context) === key)
        )
          summaries.push(entry);
      setContexts(summaries);
      let next = 0;
      const worker = async () => {
        while (!disposed && next < summaries.length) {
          const entry = summaries[next++];
          const key = accountContextKey(entry.context);
          if (verified.current.has(key)) continue;
          const request = crypto.randomUUID();
          pending.add(request);
          let result: AccountContextSummary;
          try {
            const values = await api.listPlatformAccounts(
              {
                context_id: entry.context.id,
                provider: entry.context.provider,
                host: entry.context.host,
              },
              request,
            );
            if (disposed) return;
            const accounts = Array.isArray(values) ? values : [];
            result = {
              ...entry,
              accounts,
              status: accounts.some(
                (account) => account.active && account.authenticated,
              )
                ? "authenticated"
                : "signed_out",
            };
          } catch (reason) {
            if (disposed) return;
            result = {
              ...entry,
              status:
                api.taskFailure(reason).kind === "authentication"
                  ? "signed_out"
                  : "unavailable",
            };
          } finally {
            pending.delete(request);
          }
          if (!disposed)
            setContexts((previous) =>
              previous.map((value) =>
                accountContextKey(value.context) === key
                  ? (verified.current.get(key) ?? result)
                  : value,
              ),
            );
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(2, summaries.length) }, worker),
      );
    })().catch(() => {
      if (!disposed) {
        setError(true);
        setContexts([...verified.current.values()]);
      }
    });
    return () => {
      disposed = true;
      pending.forEach(
        (request) =>
          void api.cancelPlatformAccountQuery(request).catch(() => {}),
      );
    };
  }, [refreshKey, revision, enabled]);
  const unique = new Map<string, AccountSummary>();
  for (const entry of contexts)
    for (const account of entry.accounts)
      if (account.active && account.authenticated)
        unique.set(
          JSON.stringify([
            entry.context.provider,
            account.host.toLowerCase(),
            account.username,
          ]),
          { ...account, provider: entry.context.provider },
        );
  const updateContext = (
    target: api.PlatformAccountTarget,
    accounts: api.PlatformLoginAccount[],
  ) => {
    const key = targetKey(target);
    const context = contexts.find(
      (entry) => accountContextKey(entry.context) === key,
    )?.context ?? {
      id: target.context_id,
      provider: target.provider,
      host: target.host,
      label: "",
      project_scoped: false,
      remembered: true,
    };
    const entry: AccountContextSummary = {
      context,
      accounts,
      status: accounts.some(
        (account) => account.active && account.authenticated,
      )
        ? "authenticated"
        : "signed_out",
    };
    verified.current.set(key, entry);
    setContexts((previous) =>
      previous.some((value) => accountContextKey(value.context) === key)
        ? previous.map((value) =>
            accountContextKey(value.context) === key ? entry : value,
          )
        : [...previous, entry],
    );
  };
  return {
    contexts,
    accounts: [...unique.values()],
    error,
    updateContext,
    refresh: () => setRevision((value) => value + 1),
  };
}
