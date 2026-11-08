import { Check } from "lucide-react";
import type { AutomationDraft } from "../lib/tauri";
import { automationPrompts } from "../lib/automationPrompts";
import { cn } from "../utils";
import { useTranslation } from "react-i18next";

export function AutomationPromptSummary({
  prompt,
  definition,
}: {
  prompt: string;
  definition?: AutomationDraft | null;
}) {
  const { t } = useTranslation();
  const prompts = definition
    ? automationPrompts(definition, t("automation.defaultPromptVariant"))
    : null;
  return (
    <section
      aria-label={t("automation.prompt")}
      className="overflow-hidden rounded-lg border border-border-subtle bg-surface"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-3">
        <h2 className="shrink-0 text-sm font-semibold text-secondary">
          {t("automation.prompt")}
        </h2>
        {prompts && !prompts.invalid && prompts.variants.length > 1 && (
          <ul
            aria-label={t("automation.promptVariants")}
            className="flex min-w-0 flex-wrap gap-1.5"
          >
            {prompts.variants.map((variant) => (
              <li
                key={variant.id}
                title={variant.name}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-0.5 text-xs",
                  variant.id === prompts.activeId
                    ? "border-accent-border bg-accent-bg text-secondary"
                    : "border-border-subtle text-muted",
                )}
              >
                <span className="break-words">{variant.name}</span>
                {variant.id === prompts.activeId && (
                  <span
                    role="img"
                    aria-label={t("automation.activePromptVariant")}
                    title={t("automation.activePromptVariant")}
                    className="shrink-0 text-success"
                  >
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="w-full max-w-none whitespace-pre-wrap break-words px-5 py-4 text-sm leading-7 text-secondary">
        {prompt}
      </p>
    </section>
  );
}
