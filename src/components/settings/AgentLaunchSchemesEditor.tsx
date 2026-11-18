import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { AppDialog } from "../AppDialog";
import { CardActionMenu } from "../CardActionMenu";
import { ThemedSelect } from "../ThemedSelect";
import {
  launchShortcuts,
  shortcutSelected,
  toggleLaunchShortcut,
  type AgentLaunchSchemes,
  type AgentLaunchScheme,
} from "../../lib/agentLaunchConfig";

export function AgentLaunchSchemesEditor({
  agentKey,
  defaultInstruction,
  name,
  value,
  onChange,
  onInstructionKeyDown,
  actions,
}: {
  agentKey: string;
  defaultInstruction: string;
  name: string;
  value: AgentLaunchSchemes;
  onChange: (next: AgentLaunchSchemes) => void;
  onInstructionKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const instructionId = useId();
  const [selectedId, setSelectedId] = useState(value.default_id);
  const current =
    value.items.find((group) => group.id === selectedId) ?? value.items[0];
  const [dialog, setDialog] = useState<"new" | "rename" | "delete" | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [copyCurrent, setCopyCurrent] = useState(true);
  const [error, setError] = useState("");
  const isDefault = current.id === value.default_id;
  const shortcuts = launchShortcuts[agentKey] ?? [];
  const canReset = current.instruction !== defaultInstruction;
  const update = (patch: Partial<AgentLaunchScheme>) =>
    onChange({
      ...value,
      items: value.items.map((group) =>
        group.id === current.id ? { ...group, ...patch } : group,
      ),
    });
  const open = (mode: "new" | "rename" | "delete") => {
    setDraft(mode === "rename" ? current.name : "");
    setCopyCurrent(true);
    setError("");
    setDialog(mode);
  };
  const save = () => {
    const nextName = draft.trim();
    if (!nextName) {
      setError(t("agentLaunch.schemes.nameRequired"));
      return;
    }
    if (
      value.items.some(
        (group) =>
          group.name === nextName &&
          (dialog === "new" || group.id !== current.id),
      )
    ) {
      setError(t("agentLaunch.schemes.duplicateName"));
      return;
    }
    if (dialog === "rename") update({ name: nextName });
    else {
      const group = {
        id: crypto.randomUUID(),
        name: nextName,
        instruction: copyCurrent ? current.instruction : defaultInstruction,
      };
      onChange({ ...value, items: [...value.items, group] });
      setSelectedId(group.id);
    }
    setDialog(null);
  };
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <label
          htmlFor={instructionId}
          className="mr-auto shrink-0 text-xs text-secondary"
        >
          {t("agentLaunch.instruction")}
        </label>
        <ThemedSelect
          aria-label={`${name} ${t("agentLaunch.schemes.label")}`}
          value={current.id}
          onChange={(event) => setSelectedId(event.target.value)}
          className="h-7 w-auto min-w-0 max-w-44 gap-1.5 px-2 text-xs"
          title={t("agentLaunch.schemes.label")}
        >
          {value.items.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
              {group.id === value.default_id
                ? ` · ${t("agentLaunch.schemes.default")}`
                : ""}
            </option>
          ))}
        </ThemedSelect>
        <button
          type="button"
          disabled={value.items.length >= 32}
          title={t("agentLaunch.schemes.create")}
          aria-label={`${name} ${t("agentLaunch.schemes.create")}`}
          className="app-button-ghost p-1.5"
          onClick={() => open("new")}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <CardActionMenu
          label={`${name} ${t("agentLaunch.schemes.actions")}`}
          actions={[
            {
              key: "rename",
              label: t("agentLaunch.schemes.rename"),
              icon: <Pencil className="h-3.5 w-3.5" />,
              onSelect: () => open("rename"),
            },
            {
              key: "copy",
              disabled: value.items.length >= 32,
              label: t("agentLaunch.schemes.duplicate"),
              icon: <Copy className="h-3.5 w-3.5" />,
              onSelect: () => {
                open("new");
                setDraft(
                  t("agentLaunch.schemes.copyName", { name: current.name }),
                );
              },
            },
            {
              key: "default",
              label: isDefault
                ? t("agentLaunch.schemes.isDefault")
                : t("agentLaunch.schemes.setDefault"),
              icon: <Star className="h-3.5 w-3.5" />,
              disabled: isDefault,
              onSelect: () => onChange({ ...value, default_id: current.id }),
            },
            {
              key: "delete",
              label: t("agentLaunch.schemes.delete"),
              icon: <Trash2 className="h-3.5 w-3.5" />,
              danger: true,
              disabled: value.items.length === 1,
              separatorBefore: true,
              onSelect: () => open("delete"),
            },
          ]}
        />
      </div>
      <input
        id={instructionId}
        aria-label={`${name} ${t("agentLaunch.instruction")}`}
        spellCheck={false}
        value={current.instruction}
        onChange={(event) => update({ instruction: event.target.value })}
        onKeyDown={onInstructionKeyDown}
        className="block w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-sm text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      {(shortcuts.length > 0 || canReset || actions) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {shortcuts.map(({ label, flag }) => {
            const selected = shortcutSelected(current.instruction, flag);
            return (
              <button
                key={flag}
                type="button"
                aria-pressed={selected}
                title={flag}
                className={`rounded border px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent ${selected ? "border-accent-border bg-surface-active text-accent" : "border-border text-muted"}`}
                onClick={() =>
                  update({
                    instruction: toggleLaunchShortcut(
                      current.instruction,
                      flag,
                    ),
                  })
                }
              >
                {t(`agentLaunch.shortcuts.${label}`)}
              </button>
            );
          })}
          {canReset && (
            <button
              type="button"
              className="app-button-ghost text-xs"
              onClick={() => update({ instruction: defaultInstruction })}
            >
              {t("agentLaunch.reset")}
            </button>
          )}
          {actions}
        </div>
      )}
      {dialog && (
        <AppDialog
          title={
            dialog === "delete"
              ? t("agentLaunch.schemes.deleteTitle")
              : dialog === "rename"
                ? t("agentLaunch.schemes.renameTitle")
                : `${name} · ${t("agentLaunch.schemes.create")}`
          }
          onClose={() => setDialog(null)}
        >
          {dialog === "delete" ? (
            <>
              <p className="text-sm text-secondary">
                {t("agentLaunch.schemes.deleteConfirm", { name: current.name })}
              </p>
              {isDefault && (
                <p className="mt-3 text-xs text-muted">
                  {t("agentLaunch.schemes.replacement", {
                    name: value.items.find((group) => group.id !== current.id)
                      ?.name,
                  })}
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() => setDialog(null)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className="app-button-primary"
                  onClick={() => {
                    const groups = value.items.filter(
                      (group) => group.id !== current.id,
                    );
                    onChange({
                      items: groups,
                      default_id: isDefault ? groups[0].id : value.default_id,
                    });
                    setSelectedId(isDefault ? groups[0].id : value.default_id);
                    setDialog(null);
                  }}
                >
                  {t("agentLaunch.schemes.delete")}
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <label className="block space-y-1 text-xs text-secondary">
                {t("agentLaunch.schemes.name")}
                <input
                  data-initial-focus
                  className="app-input w-full"
                  value={draft}
                  maxLength={200}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t("agentLaunch.schemes.namePlaceholder")}
                />
              </label>
              {dialog === "new" && (
                <label className="mt-3 flex items-center gap-2 text-sm text-secondary">
                  <input
                    type="checkbox"
                    checked={copyCurrent}
                    onChange={(event) => setCopyCurrent(event.target.checked)}
                  />
                  {t("agentLaunch.schemes.copyInstruction", {
                    name: current.name,
                  })}
                </label>
              )}
              {error && (
                <p role="alert" className="mt-2 text-xs text-danger">
                  {error}
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() => setDialog(null)}
                >
                  {t("common.cancel")}
                </button>
                <button type="submit" className="app-button-primary">
                  {dialog === "new"
                    ? t("agentLaunch.schemes.createAction")
                    : t("agentLaunch.schemes.saveName")}
                </button>
              </div>
            </form>
          )}
        </AppDialog>
      )}
    </div>
  );
}
