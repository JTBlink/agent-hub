import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WorktreeSearchOptions } from "../../lib/worktreeSearchApi";
import { cn } from "../../utils";

export function SearchIcon({ name }: { name: string }) {
  return <span aria-hidden="true" className={`codicon codicon-${name}`} />;
}
export function WorkspaceSearchFields({
  options,
  onChange,
  replacement,
  onReplacement,
  replaceOpen,
  onReplaceOpen,
  canReplace,
  onReplace,
  onRefresh,
  disabled,
}: {
  options: WorktreeSearchOptions;
  onChange: (options: WorktreeSearchOptions) => void;
  replacement: string;
  onReplacement: (value: string) => void;
  replaceOpen: boolean;
  onReplaceOpen: (open: boolean) => void;
  canReplace: boolean;
  onReplace: () => void;
  onRefresh: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [filters, setFilters] = useState(false);
  const history = useRef<string[]>([]);
  const position = useRef(-1);
  const draft = useRef("");
  const update = (patch: Partial<WorktreeSearchOptions>) =>
    onChange({ ...options, ...patch });
  return (
    <div className="shrink-0 space-y-1 px-2 pb-2">
      <div className="flex min-w-0 items-start gap-1">
        <button
          type="button"
          aria-expanded={replaceOpen}
          aria-label={t("workspaceSearch.toggleReplace")}
          title={t("workspaceSearch.toggleReplace")}
          onClick={() => onReplaceOpen(!replaceOpen)}
          className="app-button-ghost mt-1 h-6 w-4 shrink-0 p-0"
        >
          <SearchIcon name={replaceOpen ? "chevron-down" : "chevron-right"} />
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (options.query) {
                history.current = [
                  options.query,
                  ...history.current.filter((item) => item !== options.query),
                ].slice(0, 20);
                position.current = -1;
              }
              onRefresh();
            }}
          >
            <div className="flex min-w-0 items-center rounded-sm border border-border bg-background focus-within:border-accent">
              <input
                data-workspace-search-input
                type="text"
                aria-label={t("workspaceSearch.query")}
                placeholder={t("workspaceSearch.title")}
                title={t("workspaceSearch.placeholder")}
                value={options.query}
                disabled={disabled}
                onChange={(event) => {
                  position.current = -1;
                  update({ query: event.target.value });
                }}
                onKeyDown={(event) => {
                  if (
                    !["ArrowUp", "ArrowDown"].includes(event.key) ||
                    !history.current.length
                  )
                    return;
                  event.preventDefault();
                  if (position.current === -1) draft.current = options.query;
                  position.current = Math.max(
                    -1,
                    Math.min(
                      history.current.length - 1,
                      position.current + (event.key === "ArrowUp" ? 1 : -1),
                    ),
                  );
                  update({
                    query:
                      position.current < 0
                        ? draft.current
                        : history.current[position.current],
                  });
                }}
                className="h-7 min-w-0 flex-1 bg-transparent px-2 text-sm text-primary placeholder:text-faint focus:outline-none"
              />
              <div className="flex shrink-0 pr-0.5">
                {(
                  [
                    ["case_sensitive", "case-sensitive", "matchCase"],
                    ["whole_word", "whole-word", "wholeWord"],
                    ["regex", "regex", "regex"],
                  ] as const
                ).map(([key, icon, label]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    aria-label={t(`workspaceSearch.${label}`)}
                    title={t(`workspaceSearch.${label}`)}
                    aria-pressed={options[key]}
                    onClick={() => update({ [key]: !options[key] })}
                    className={cn(
                      "app-button-ghost h-6 w-6 rounded-sm p-0",
                      options[key] &&
                        "bg-surface-active text-accent-light ring-1 ring-inset ring-accent-border",
                    )}
                  >
                    <SearchIcon name={icon} />
                  </button>
                ))}
              </div>
            </div>
          </form>
          {replaceOpen && (
            <div className="flex min-w-0 items-center gap-1">
              <input
                type="text"
                disabled={disabled}
                aria-label={t("workspaceSearch.replacement")}
                placeholder={t("workspaceSearch.replacement")}
                value={replacement}
                onChange={(event) => onReplacement(event.target.value)}
                className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 text-sm text-primary placeholder:text-faint focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                disabled={!canReplace || disabled}
                onClick={onReplace}
                aria-label={t("workspaceSearch.replaceAll")}
                title={t("workspaceSearch.replaceAll")}
                className="app-button-ghost h-7 w-7 shrink-0 p-0"
              >
                <SearchIcon name="replace-all" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          aria-expanded={filters}
          aria-label={t("workspaceSearch.filters")}
          title={t("workspaceSearch.filters")}
          onClick={() => setFilters(!filters)}
          className="app-button-ghost h-5 w-7 p-0"
        >
          <SearchIcon name="ellipsis" />
        </button>
      </div>
      {filters && (
        <div className="space-y-1.5 pl-5 text-xs text-muted">
          {(["include", "exclude"] as const).map((key) => (
            <div key={key} className="space-y-0.5">
              <label htmlFor={`${id}-${key}`}>
                {t(`workspaceSearch.${key}`)}
              </label>
              <div className="flex min-w-0 items-center rounded-sm border border-border bg-background focus-within:border-accent">
                <input
                  id={`${id}-${key}`}
                  disabled={disabled}
                  aria-label={t(`workspaceSearch.${key}`)}
                  value={options[key]}
                  onChange={(event) => update({ [key]: event.target.value })}
                  title={t(`workspaceSearch.${key}Hint`)}
                  className="h-7 min-w-0 flex-1 bg-transparent px-2 text-xs text-primary focus:outline-none"
                />
                {key === "exclude" && (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={t("workspaceSearch.useIgnore")}
                    title={t("workspaceSearch.useIgnore")}
                    aria-pressed={options.use_ignore}
                    onClick={() => update({ use_ignore: !options.use_ignore })}
                    className={cn(
                      "app-button-ghost mr-0.5 h-6 w-6 shrink-0 rounded-sm p-0",
                      options.use_ignore &&
                        "bg-surface-active text-accent-light ring-1 ring-inset ring-accent-border",
                    )}
                  >
                    <SearchIcon name="settings-gear" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
