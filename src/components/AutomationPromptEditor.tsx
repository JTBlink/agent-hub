import "./AutomationPromptEditor.css";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationDraft } from "../lib/tauri";
import {
  automationPrompts,
  MAX_PROMPT_VARIANTS,
  PROMPT_VARIANTS_PATH,
  updateAutomationPrompts,
  type AutomationPromptVariant,
} from "../lib/automationPrompts";
import { ConfirmDialog } from "./ConfirmDialog";
import { AutomationPromptVariantRow } from "./AutomationPromptVariantRow";

export function AutomationPromptEditor({
  draft,
  disabled,
  inactivePrompt,
  usesAgent,
  onChange,
}: {
  draft: AutomationDraft;
  disabled: boolean;
  inactivePrompt: string;
  usesAgent: boolean;
  onChange: (change: Partial<AutomationDraft>) => void;
}) {
  const { t } = useTranslation();
  const group = useId();
  const titleId = useId();
  const nameField = useRef<HTMLInputElement>(null);
  const focusName = useRef(false);
  const [viewedId, setViewedId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AutomationPromptVariant | null>(
    null,
  );
  const state = automationPrompts(draft, t("automation.defaultPromptVariant"));
  const viewed =
    state.variants.find((variant) => variant.id === viewedId) ??
    state.variants.find((variant) => variant.id === state.activeId)!;
  useEffect(() => {
    if (focusName.current) {
      focusName.current = false;
      nameField.current?.focus();
      nameField.current?.select();
    }
  }, [viewedId]);
  const blocked = disabled || !usesAgent || state.invalid;
  const update = (
    variants = state.variants,
    id = state.activeId,
    persistManifest = true,
  ) => onChange(updateAutomationPrompts(draft, variants, id, persistManifest));
  const changeViewed = (
    change: Partial<AutomationPromptVariant>,
    persistManifest = true,
  ) =>
    update(
      state.variants.map((variant) =>
        variant.id === viewed.id ? { ...variant, ...change } : variant,
      ),
      state.activeId,
      persistManifest,
    );
  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-1 flex-col gap-3 [container-name:automation-prompts] [container-type:inline-size]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="text-xs font-medium text-muted">
          {t("automation.prompt")}
        </h3>
        {usesAgent && (
          <span className="text-xs text-muted">
            {t("automation.promptVariantsCount", {
              count: state.variants.length,
            })}
          </span>
        )}
      </div>
      {state.invalid && (
        <p role="alert" className="text-sm text-danger">
          {t("automation.promptVariantsInvalid")}
        </p>
      )}
      {usesAgent && !state.invalid ? (
        <div className="automation-prompt-layout grid min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-bg-secondary">
          <fieldset
            disabled={blocked}
            className="automation-prompt-list flex min-w-0 flex-col gap-3 border-b border-border-subtle p-3"
          >
            <legend className="sr-only">
              {t("automation.promptVariants")}
            </legend>
            <p className="text-xs leading-5 text-muted">
              {t("automation.promptVariantsSelectHint")}
            </p>
            <div
              className="max-h-[360px] space-y-2 overflow-y-auto"
              role="radiogroup"
              aria-label={t("automation.promptVariants")}
            >
              {state.variants.map((variant) => (
                <AutomationPromptVariantRow
                  key={variant.id}
                  variant={variant}
                  viewed={viewed.id === variant.id}
                  active={state.activeId === variant.id}
                  disabled={blocked}
                  canDelete={state.variants.length > 1}
                  group={group}
                  onView={() => {
                    if (viewed.id === variant.id) nameField.current?.focus();
                    else focusName.current = true;
                    setViewedId(variant.id);
                  }}
                  onActivate={() => {
                    setViewedId(variant.id);
                    update(state.variants, variant.id);
                  }}
                  onRename={(name) =>
                    update(
                      state.variants.map((item) =>
                        item.id === variant.id ? { ...item, name } : item,
                      ),
                    )
                  }
                  onRemove={() => setRemoving(variant)}
                />
              ))}
            </div>
            <button
              type="button"
              data-add-prompt
              disabled={blocked || state.variants.length >= MAX_PROMPT_VARIANTS}
              className="app-button-secondary justify-center text-xs"
              onClick={() => {
                const id = crypto.randomUUID();
                update([
                  ...state.variants,
                  {
                    id,
                    name: t("automation.newPromptVariant", {
                      count: state.variants.length + 1,
                    }),
                    content: "",
                  },
                ]);
                focusName.current = true;
                setViewedId(id);
              }}
            >
              <Plus size={14} aria-hidden="true" />
              {t("automation.addPromptVariant")}
            </button>
          </fieldset>
          <fieldset
            disabled={blocked}
            className="flex min-w-0 flex-col gap-4 bg-surface p-4"
          >
            <legend className="sr-only">
              {t("automation.editPromptVariant", { name: viewed.name })}
            </legend>
            <label className="flex flex-col gap-2 text-xs font-medium text-muted">
              {t("automation.promptVariantName")}
              <input
                ref={nameField}
                required
                maxLength={200}
                value={viewed.name}
                aria-label={t("automation.promptVariantName")}
                onChange={(event) => changeViewed({ name: event.target.value })}
                className="app-input w-full px-3 py-2.5 text-sm"
              />
            </label>
            <label className="flex min-h-0 flex-1 flex-col gap-2 text-xs font-medium text-muted">
              {t("automation.promptVariantContent")}
              <textarea
                aria-label={t("automation.prompt")}
                required
                disabled={blocked}
                maxLength={65536}
                value={viewed.content}
                onChange={(event) =>
                  changeViewed(
                    { content: event.target.value },
                    !!draft.files?.some(
                      (file) => file.path === PROMPT_VARIANTS_PATH,
                    ),
                  )
                }
                placeholder={t("automation.agentPromptPlaceholder")}
                className="app-input min-h-[280px] w-full flex-1 resize-y p-4 text-sm leading-7 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
            <p className="text-xs leading-5 text-muted">
              {t("automation.promptVariantsEditHint")}
            </p>
          </fieldset>
        </div>
      ) : (
        <textarea
          aria-label={t("automation.prompt")}
          disabled
          value={usesAgent ? viewed.content : inactivePrompt}
          placeholder={t("automation.chooseAgentPrompt")}
          className="app-input min-h-[280px] w-full resize-y p-5 text-sm leading-7 disabled:cursor-not-allowed disabled:bg-bg-secondary disabled:text-muted"
        />
      )}
      {createPortal(
        <ConfirmDialog
          open={removing !== null}
          title={t("automation.deletePromptVariant", { name: removing?.name })}
          message={t("automation.deletePromptVariantConfirm", {
            name: removing?.name,
          })}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            if (!removing || state.variants.length === 1) return;
            const next = state.variants.filter(
              (variant) => variant.id !== removing.id,
            );
            const activeId =
              removing.id === state.activeId ? next[0].id : state.activeId;
            update(next, activeId);
            if (viewed.id === removing.id) setViewedId(activeId);
          }}
        />,
        document.body,
      )}
    </section>
  );
}
