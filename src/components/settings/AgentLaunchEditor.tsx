import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { useAgentLaunchSettings } from "../../hooks/useAgentLaunchSettings";
import {
  launchShortcuts,
  shortcutSelected,
  toggleLaunchShortcut,
} from "../../lib/agentLaunchConfig";

type Controller = ReturnType<typeof useAgentLaunchSettings>;
export function AgentLaunchEditor({
  agentKey,
  controller,
}: {
  agentKey: string;
  controller: Controller;
}) {
  const { t } = useTranslation();
  const { snapshot, busy, error, save } = controller;
  const unavailable = !snapshot;
  const disabled = busy || unavailable;
  const saved =
    snapshot?.document.instructions[agentKey] ??
    snapshot?.defaults[agentKey] ??
    (snapshot ? agentKey : "");
  const [draft, setDraft] = useState<{ value: string; base: string } | null>(
    null,
  );
  const value = draft?.value ?? saved;
  const conflict = !!draft && draft.base !== saved && value !== saved;
  const edit = (next: string) =>
    setDraft(
      next === saved ? null : { value: next, base: draft?.base ?? saved },
    );
  const dirty = value !== saved;
  const persist = async (reset = false) => {
    if (!snapshot) return;
    const ok = await save((current) => {
      const instructions = { ...current.instructions };
      if (reset || value.trim() === snapshot.defaults[agentKey])
        delete instructions[agentKey];
      else instructions[agentKey] = value.trim();
      return { ...current, instructions };
    });
    if (ok) setDraft(null);
  };
  return (
    <div className="mt-2 space-y-2" aria-busy={unavailable && !error}>
      <label className="block text-xs text-secondary">
        {t("agentLaunch.instruction")}
        <input
          aria-label={t("agentLaunch.instruction")}
          value={value}
          disabled={disabled}
          placeholder={
            unavailable
              ? t(error ? "common.error" : "common.loading")
              : undefined
          }
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) void persist();
            if (e.key === "Escape") setDraft(null);
          }}
          className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-sm text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>
      {conflict && (
        <p
          role="alert"
          className="order-last w-full break-words text-xs text-danger"
        >
          {t("agentLaunch.changed")} <code>{saved}</code>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {(launchShortcuts[agentKey] ?? []).map((shortcut) => (
          <button
            key={shortcut.flag}
            type="button"
            disabled={disabled}
            aria-pressed={shortcutSelected(value, shortcut.flag)}
            title={shortcut.flag}
            className={`rounded border px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent ${shortcutSelected(value, shortcut.flag) ? "border-accent-border text-accent bg-surface-active" : "border-border text-muted"}`}
            onClick={() => edit(toggleLaunchShortcut(value, shortcut.flag))}
          >
            {t(`agentLaunch.shortcuts.${shortcut.label}`)}
          </button>
        ))}
        {dirty && (
          <>
            <button
              type="button"
              disabled={disabled || !value.trim()}
              className="app-button-secondary text-xs"
              onClick={() => void persist()}
            >
              {t(conflict ? "agentLaunch.overwrite" : "common.save")}
            </button>
            <button
              type="button"
              disabled={disabled}
              className="app-button-ghost text-xs"
              onClick={() => setDraft(null)}
            >
              {t("common.cancel")}
            </button>
          </>
        )}
        {snapshot &&
          Object.hasOwn(snapshot.document.instructions, agentKey) && (
            <button
              type="button"
              disabled={disabled}
              className="app-button-ghost text-xs"
              onClick={() => void persist(true)}
            >
              {t("agentLaunch.reset")}
            </button>
          )}

        <button
          type="button"
          aria-pressed={snapshot?.document.default_agent === agentKey}
          disabled={disabled}
          className="ml-auto text-xs text-accent focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() =>
            void save((current) => ({ ...current, default_agent: agentKey }))
          }
        >
          {t(
            snapshot?.document.default_agent === agentKey
              ? "agentLaunch.default"
              : "agentLaunch.setDefault",
          )}
        </button>
      </div>
    </div>
  );
}
