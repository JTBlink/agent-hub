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
  onDraftChange,
}: {
  agentKey: string;
  agentName?: string;
  controller: Controller;
  saveOnUnmount?: boolean;
  onDraftChange?: (dirty: boolean) => void;
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
  const value = draft?.value ?? saved;
  const dirty = !!draft && JSON.stringify(draft.value) !== encoded;
  const conflict = !!draft && draft.base !== encoded && dirty;
  useEffect(() => {
    onDraftChange?.(dirty);
  }, [dirty, onDraftChange]);
  const persist = async (overwrite = false) => {
    if (!value || !snapshot || !dirty) return;
    const submitted = JSON.stringify(value);
    if (
      await save((current) => {
        const currentValue = agentLaunchSchemes(
          { ...snapshot, document: current },
          agentKey,
          t("agentLaunch.schemes.automatic"),
        );
        if (!overwrite && draft && JSON.stringify(currentValue) !== draft.base)
          throw new Error(t("agentLaunch.changed"));
        return withAgentLaunchSchemes(current, agentKey, value);
      })
    )
      setDraft((current) =>
        current && JSON.stringify(current.value) !== submitted
          ? { ...current, base: submitted }
          : null,
      );
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
  useEffect(
    () => () => {
      if (saveOnUnmount) void persistRef.current();
    },
    [saveOnUnmount],
  );
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
    <fieldset disabled={busy} className="min-w-0" aria-busy={busy}>
      <AgentLaunchSchemesEditor
        key={agentKey}
        name={agentName ?? agentKey}
        defaultInstruction={snapshot.defaults[agentKey] ?? agentKey}
        value={value}
        onChange={(next) =>
          setDraft({ base: draft?.base ?? encoded, value: next })
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
              className="app-button-secondary text-xs"
              onClick={() => void persist(conflict)}
            >
              {t(conflict ? "agentLaunch.overwrite" : "common.save")}
            </button>
            <button
              type="button"
              className="app-button-ghost text-xs"
              onClick={() => setDraft(null)}
            >
              {t("common.cancel")}
            </button>
          </>
        )}
        <button
          type="button"
          className="ml-auto text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
    </fieldset>
  );
}
