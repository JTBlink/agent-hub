import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { useAgentLaunchSettings } from "../../hooks/useAgentLaunchSettings";
import {
  agentLaunchSchemes,
  withAgentLaunchSchemes,
  type AgentLaunchSchemes,
} from "../../lib/agentLaunchConfig";
import { AgentLaunchSchemesEditor } from "./AgentLaunchSchemesEditor";

type Controller = ReturnType<typeof useAgentLaunchSettings>;
export function AgentLaunchEditor({
  agentKey,
  agentName,
  controller,
  saveOnUnmount = false,
}: {
  agentKey: string;
  agentName?: string;
  controller: Controller;
  saveOnUnmount?: boolean;
}) {
  const { t } = useTranslation();
  const { snapshot, busy, error, save } = controller;
  const saved = snapshot
    ? agentLaunchSchemes(snapshot, agentKey, t("agentLaunch.schemes.automatic"))
    : null;
  const encoded = JSON.stringify(saved);
  const [draft, setDraft] = useState<{
    base: string;
    value: AgentLaunchSchemes;
  } | null>(null);
  const latestDraft = useRef(draft);
  const savingDraft = useRef(false);
  const flushAfterSave = useRef(false);
  const updateDraft = (next: typeof draft) => {
    latestDraft.current = next;
    setDraft(next);
  };
  const value = draft?.value ?? saved;
  const dirty = !!draft && JSON.stringify(draft.value) !== encoded;
  const conflict = !!draft && draft.base !== encoded && dirty;
  const persist = async (overwrite = false) => {
    const pending = latestDraft.current;
    if (!snapshot || !pending || savingDraft.current) return;
    const submitted = JSON.stringify(pending.value);
    if (submitted === pending.base) return;

    savingDraft.current = true;
    const ok = await save((current) => {
      const currentValue = agentLaunchSchemes(
        { ...snapshot, document: current },
        agentKey,
        t("agentLaunch.schemes.automatic"),
      );
      if (!overwrite && JSON.stringify(currentValue) !== pending.base)
        throw new Error(t("agentLaunch.changed"));
      return withAgentLaunchSchemes(current, agentKey, pending.value);
    });
    savingDraft.current = false;
    if (!ok) return;
    const latest = latestDraft.current;
    updateDraft(
      latest && JSON.stringify(latest.value) !== submitted
        ? { ...latest, base: submitted }
        : null,
    );
    if (flushAfterSave.current) void persist();
  };
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  });
  useEffect(() => {
    if (!dirty || conflict || busy || error) return;
    const timer = window.setTimeout(() => void persistRef.current(), 250);
    return () => window.clearTimeout(timer);
  }, [dirty, conflict, busy, error, draft]);
  useEffect(() => {
    flushAfterSave.current = false;
    return () => {
      if (!saveOnUnmount) return;
      if (savingDraft.current) flushAfterSave.current = true;
      else void persistRef.current();
    };
  }, [saveOnUnmount]);
  if (!snapshot || !value)
    return (
      <div
        className="mt-2 flex items-center gap-2 text-xs text-muted"
        role={error ? "alert" : "status"}
      >
        <span>{error || t("common.loading")}</span>
        {error && (
          <button
            type="button"
            className="text-accent"
            onClick={() => void controller.reload()}
          >
            {t("common.retry")}
          </button>
        )}
      </div>
    );
  return (
    <div className="min-w-0">
      <AgentLaunchSchemesEditor
        key={agentKey}
        agentKey={agentKey}
        name={agentName ?? agentKey}
        defaultInstruction={snapshot.defaults[agentKey] ?? agentKey}
        value={value}
        onInstructionKeyDown={(event) => {
          if (event.key === "Enter" && dirty && !conflict && !busy) {
            event.preventDefault();
            void persist();
          }
          if (event.key === "Escape" && dirty && !busy) {
            event.stopPropagation();
            updateDraft(null);
          }
        }}
        onChange={(next) =>
          updateDraft({
            base: latestDraft.current?.base ?? encoded,
            value: next,
          })
        }
      />
      {conflict && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {t("agentLaunch.changed")}{" "}
          <code>
            {
              saved?.items.find((item) => item.id === saved.default_id)
                ?.instruction
            }
          </code>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs">
        {dirty && (
          <>
            <button
              type="button"
              disabled={busy}
              className="app-button-secondary text-xs"
              onClick={() => void persist(conflict)}
            >
              {t(conflict ? "agentLaunch.overwrite" : "common.save")}
            </button>
            <button
              type="button"
              disabled={busy}
              className="app-button-ghost text-xs"
              onClick={() => updateDraft(null)}
            >
              {t("common.cancel")}
            </button>
          </>
        )}
        <button
          type="button"
          className="ml-auto text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent"
          disabled={busy}
          aria-pressed={snapshot.document.default_agent === agentKey}
          onClick={() =>
            void save((current) => ({ ...current, default_agent: agentKey }))
          }
        >
          {t(
            snapshot.document.default_agent === agentKey
              ? "agentLaunch.defaultAgent"
              : "agentLaunch.setDefaultAgent",
          )}
        </button>
      </div>
    </div>
  );
}
