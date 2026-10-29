import { useEffect, useRef, useState } from "react";
import { ChevronLeft, RotateCcw, Sparkles, Terminal, Bot } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getAutomationBackups,
  getAutomationTemplates,
  type AutomationDraft,
  type AutomationBackup,
  type AutomationCatalog,
} from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { automationPromptFile, automationHerdrConfig } from "../lib/automation";

const load = (locale: string, source: "builtin" | "backup") =>
  Promise.allSettled([
    getAutomationTemplates(locale),
    source === "backup" ? getAutomationBackups() : Promise.resolve([]),
  ]);

export function AutomationTemplatePicker({
  source = "builtin",
  hermesInstalled,
  onChoose,
  onBack,
}: {
  source?: "builtin" | "backup";
  hermesInstalled: boolean;
  onChoose: (draft: AutomationDraft) => void;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [catalog, setCatalog] = useState<AutomationCatalog | null>(null);
  const [backups, setBackups] = useState<AutomationBackup[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [settled, setSettled] = useState("");
  const [attempt, setAttempt] = useState(0);
  const title = t(
    source === "backup" ? "automation.restoreBackup" : "automation.useTemplate",
  );
  const requestKey = `${locale}:${source}`;
  const request = useRef<{
    key: string;
    promise: ReturnType<typeof load>;
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (!request.current || request.current.key !== requestKey)
      request.current = { key: requestKey, promise: load(locale, source) };
    void request.current.promise.then(([templates, saved]) => {
      if (!active) return;
      setCatalog(templates.status === "fulfilled" ? templates.value : null);
      setBackups(saved.status === "fulfilled" ? saved.value : []);
      setErrors(
        [templates, saved].flatMap((result) =>
          result.status === "rejected"
            ? [getErrorMessage(result.reason, "")]
            : [],
        ),
      );
      setSettled(requestKey);
    });
    return () => {
      active = false;
    };
  }, [locale, source, requestKey, attempt]);
  const loading = settled !== requestKey;
  const cards =
    source === "builtin"
      ? (catalog?.templates ?? []).map((template) => ({
          id: template.id,
          title: template.title,
          description: template.description,
          draft: template.draft,
          disabled: false,
        }))
      : backups.map((backup) => ({
          id: backup.id,
          title: backup.draft.name,
          description: t("automation.backupTemplateHint"),
          draft: { ...backup.draft, enabled: false },
          disabled:
            backup.draft.provider === "system" &&
            backup.shell !== catalog?.shell,
        }));
  const visibleCards = cards.filter(
    (card) => card.draft.provider !== "hermes" || hermesInstalled,
  );
  return (
    <section
      aria-label={title}
      className="min-h-0 space-y-5 overflow-y-auto p-6 md:p-8"
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded text-[13px] text-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ChevronLeft className="h-4 w-4" />
        {t(
          source === "backup"
            ? "automation.backToList"
            : "automation.backToEditor",
        )}
      </button>
      <div>
        <h3 className="flex items-center gap-2 text-xl font-semibold text-primary">
          {source === "backup" ? (
            <RotateCcw className="h-5 w-5 text-accent-light" />
          ) : (
            <Sparkles className="h-5 w-5 text-accent-light" />
          )}
          {title}
        </h3>
        <p className="mt-2 text-[12px] leading-6 text-muted">
          {t(
            source === "backup"
              ? "automation.backupSourceHelp"
              : "automation.templateHint",
          )}
        </p>
      </div>
      {!!errors.length && (
        <div role="alert" className="text-[12px] text-danger">
          <p>{errors.join("; ")}</p>
          <button
            type="button"
            className="mt-2 underline"
            onClick={() => {
              request.current = null;
              setSettled("");
              setAttempt((value) => value + 1);
            }}
          >
            {t("automation.refresh")}
          </button>
        </div>
      )}
      {loading ? (
        <p role="status" className="text-[13px] text-muted">
          {t("common.loading")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleCards.map((card) => (
            <button
              key={card.id}
              aria-label={card.title}
              type="button"
              disabled={card.disabled}
              title={card.disabled ? t("automation.otherShell") : undefined}
              onClick={() => onChoose(card.draft)}
              className="flex min-w-0 flex-col items-start gap-2 rounded-lg border border-border-subtle bg-surface p-4 text-left hover:border-accent-border hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-[13px] font-medium text-primary">
                {card.draft.provider === "hermes" ||
                automationPromptFile(card.draft) ? (
                  <Bot className="h-4 w-4 text-accent-light" />
                ) : (
                  <Terminal className="h-4 w-4 text-accent-light" />
                )}
                <span className="break-words">{card.title}</span>
              </span>
              <span className="text-[12px] leading-6 text-muted">
                {card.disabled ? t("automation.otherShell") : card.description}
              </span>
              <span className="mt-auto pt-1 text-[11px] text-muted">
                {automationHerdrConfig(card.draft)
                  ? "Herdr"
                  : card.draft.provider === "hermes"
                    ? "Hermes"
                    : t("automation.filters.system")}
              </span>
            </button>
          ))}
          {!visibleCards.length && (
            <p className="py-4 text-[13px] text-muted">
              {t(
                source === "backup"
                  ? "automation.noBackupTemplates"
                  : "automation.noTemplates",
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
