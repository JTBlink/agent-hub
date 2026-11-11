import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AutomationDraft } from "../lib/tauri";
import {
  automationPrompts,
  MAX_PROMPT_VARIANTS,
  MAX_PROMPT_BEHAVIOR_BYTES,
  PROMPT_VARIANTS_PATH,
  updateAutomationPrompts,
  type AutomationPromptVariant,
} from "../lib/automationPrompts";
import { AutomationVariablesField } from "./AutomationVariablesField";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  SidebarEditorLayout,
  SidebarEditorActions,
} from "./SidebarEditorLayout";
import { SidebarListPanel } from "./SidebarListPanel";
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
  const [showBehavior, setShowBehavior] = useState(false);
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
  const atLimit = state.variants.length >= MAX_PROMPT_VARIANTS;
  const lastVariant = state.variants.length === 1;
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
  const copyVariant = (variant: AutomationPromptVariant) => {
    if (blocked || atLimit) return;
    const id = crypto.randomUUID();
    update([
      ...state.variants,
      {
        ...variant,
        id,
        name: t("automation.copyName", { name: variant.name }),
      },
    ]);
    focusName.current = true;
    setViewedId(id);
  };
  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-1 flex-col gap-3"
    >
      <SidebarEditorLayout
        heading={
          <h3 id={titleId} className="text-xs font-medium text-muted">
            {t("automation.prompt")}
          </h3>
        }
        actions={
          usesAgent && (
            <SidebarEditorActions
              create={{
                label: t("automation.addPromptVariant"),
                disabled: blocked || atLimit,
                onClick: () => {
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
                },
              }}
              copy={{
                label: t("automation.copyPromptVariant"),
                disabled: blocked || atLimit,
                onClick: () => copyVariant(viewed),
              }}
              remove={{
                label: t("automation.deletePromptVariant", {
                  name: viewed.name,
                }),
                disabled: blocked || lastVariant,
                onClick: () => setRemoving(viewed),
              }}
            />
          )
        }
        above={
          state.invalid && (
            <p role="alert" className="text-sm text-danger">
              {t("automation.promptVariantsInvalid")}
            </p>
          )
        }
        sidebar={
          usesAgent && !state.invalid ? (
            <SidebarListPanel
              title={t("automation.promptVariants")}
              count={state.variants.length}
              description={t("automation.promptVariantsSelectHint")}
              footer={<p>{t("automation.promptVariantsEditHint")}</p>}
            >
              <div
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
                    copy={{
                      disabled: atLimit,
                      onSelect: () => copyVariant(variant),
                    }}
                    remove={{
                      disabled: lastVariant,
                      onSelect: () => setRemoving(variant),
                    }}
                    onRename={(name) =>
                      update(
                        state.variants.map((item) =>
                          item.id === variant.id ? { ...item, name } : item,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </SidebarListPanel>
          ) : undefined
        }
      >
        {usesAgent && !state.invalid ? (
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
            <details
              className="rounded-md border border-border-subtle px-3 py-2"
              open={showBehavior}
              onToggle={(event) => setShowBehavior(event.currentTarget.open)}
            >
              <summary className="cursor-pointer text-xs font-medium text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                <span className="mr-2">{t("automation.promptAdvanced")}</span>
                <span className="font-normal text-tertiary">
                  {t("automation.promptVariantBehaviorOptional")}
                </span>
              </summary>
              <label className="mt-3 flex flex-col gap-2 text-xs font-medium text-muted">
                {t("automation.promptVariantBehavior")}
                <input
                  maxLength={MAX_PROMPT_BEHAVIOR_BYTES}
                  value={viewed.behavior ?? ""}
                  aria-label={t("automation.promptVariantBehavior")}
                  onChange={(event) =>
                    changeViewed({ behavior: event.target.value })
                  }
                  placeholder={t("automation.promptVariantBehaviorPlaceholder")}
                  className="app-input w-full px-3 py-2.5 text-sm"
                />
              </label>
              <AutomationVariablesField
                key={viewed.id}
                variables={viewed.variables ?? []}
                disabled={blocked}
                onChange={(variables) => changeViewed({ variables })}
              />
            </details>
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
          </fieldset>
        ) : (
          <textarea
            aria-label={t("automation.prompt")}
            disabled
            value={usesAgent ? viewed.content : inactivePrompt}
            placeholder={t("automation.chooseAgentPrompt")}
            className="app-input min-h-[280px] w-full resize-y p-5 text-sm leading-7 disabled:cursor-not-allowed disabled:bg-bg-secondary disabled:text-muted"
          />
        )}
      </SidebarEditorLayout>
      {createPortal(
        <ConfirmDialog
          open={removing !== null}
          title={t("automation.deletePromptVariant", { name: removing?.name })}
          message={t("automation.deletePromptVariantConfirm", {
            name: removing?.name,
          })}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            if (!removing || lastVariant) return;
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
