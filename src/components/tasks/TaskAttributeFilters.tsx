import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ListFilter, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RepositoryTask, TaskFilters } from "../../lib/taskBrowserApi";
import { CardActionMenu } from "../CardActionMenu";

type Section = "state" | "author" | "labels" | "assignee";

export function TaskAttributeFilters({
  filters,
  items,
  onChange,
}: {
  filters: TaskFilters;
  items: RepositoryTask[];
  onChange: (patch: Partial<TaskFilters>) => void;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section | null>(null);
  const [input, setInput] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (section)
      panel.current
        ?.querySelector<HTMLElement>("input, [aria-pressed]")
        ?.focus();
  }, [section]);
  const names = {
    state: t("tasks.state"),
    author: t("tasks.facts.author"),
    labels: t("tasks.facts.labels"),
    assignee: t("tasks.assignee"),
  };
  const states: TaskFilters["state"][] = [
    "open",
    "closed",
    ...(filters.kind === "review" ? ["merged" as const, "draft" as const] : []),
    "all",
  ];
  const stateLabel = (state: string) =>
    t(
      state === "draft"
        ? "tasks.facts.draft"
        : state === "all"
          ? "tasks.allStates"
          : `tasks.${state}`,
    );
  const labels = filters.labels ?? [];
  const active =
    Number(filters.state !== "open") +
    Number(!!filters.author) +
    Number(!!filters.assignee) +
    Number(labels.length > 0);
  const options =
    section === "labels"
      ? [
          ...new Set([
            ...labels,
            ...items.flatMap((item) => item.metadata?.labels ?? []),
          ]),
        ]
      : [
          ...new Set([
            "@me",
            ...(section === "author"
              ? [filters.author, ...items.map((item) => item.metadata?.author)]
              : [filters.assignee, ...items.flatMap((item) => item.assignees)]),
          ]),
        ].filter((value): value is string => !!value);
  return (
    <CardActionMenu
      label={t("tasks.filters")}
      align="start"
      triggerClassName="app-button-secondary h-7 w-auto px-2 text-xs"
      triggerIcon={
        <>
          <ListFilter size={14} />
          <span>{t("tasks.filters")}</span>
          {active > 0 && <span>{active}</span>}
        </>
      }
      onOpenChange={(open) => {
        if (!open) {
          setSection(null);
          setInput("");
        }
      }}
      actions={[
        ...(["state", "author", "labels", "assignee"] as const).map((key) => ({
          key,
          label: names[key],
          keepOpen: true,
          onSelect: () => {
            setSection(key);
            setInput("");
          },
        })),
        {
          key: "clear",
          label: t("tasks.clearFilters"),
          onSelect: () =>
            onChange({
              state: "open",
              author: "",
              assignee: "",
              labels: [],
              personal: "all",
            }),
        },
      ]}
      renderContent={
        section
          ? (close) => {
              const select = (value: string, toggle = true) => {
                if (section === "labels")
                  onChange({
                    labels: labels.includes(value)
                      ? toggle
                        ? labels.filter((label) => label !== value)
                        : labels
                      : [...labels, value],
                  });
                else if (section === "author" || section === "assignee") {
                  onChange({ [section]: value, personal: "all" });
                  close();
                }
                setInput("");
              };
              return (
                <div
                  ref={panel}
                  className="w-64 max-w-full text-xs"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      setSection(null);
                    }
                  }}
                >
                  <div className="mb-1 flex items-center gap-2 border-b border-border-subtle pb-1">
                    <button
                      type="button"
                      className="app-button-ghost h-7 gap-1 text-xs"
                      onClick={() => setSection(null)}
                    >
                      <ArrowLeft size={13} />
                      {names[section]}
                    </button>
                    <button
                      type="button"
                      className="app-button-ghost ml-auto h-7 w-7 p-0"
                      aria-label={t("common.close")}
                      onClick={close}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {section === "state" ? (
                    <div className="flex flex-col gap-1">
                      {states.map((state) => (
                        <button
                          key={state}
                          type="button"
                          aria-pressed={filters.state === state}
                          className="app-button-ghost justify-between text-xs"
                          onClick={() => {
                            onChange({ state });
                            close();
                          }}
                        >
                          {stateLabel(state)}
                          {filters.state === state && <Check size={13} />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <form
                        className="flex min-w-0 gap-1 p-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (input.trim()) select(input.trim(), false);
                        }}
                      >
                        <input
                          aria-label={names[section]}
                          className="app-input h-7 min-w-0 flex-1 text-xs"
                          maxLength={256}
                          placeholder={t("tasks.filterValue")}
                          value={input}
                          onChange={(event) => setInput(event.target.value)}
                        />
                        <button
                          type="submit"
                          className="app-button-secondary h-7 shrink-0 text-xs"
                          disabled={!input.trim()}
                        >
                          {t("tasks.applyFilter")}
                        </button>
                      </form>
                      <div className="flex max-h-60 flex-col gap-1 overflow-y-auto p-1">
                        {options
                          .filter((value) =>
                            value.toLowerCase().includes(input.toLowerCase()),
                          )
                          .map((value) => (
                            <button
                              type="button"
                              key={value}
                              aria-pressed={
                                section === "labels"
                                  ? labels.includes(value)
                                  : filters[section] === value
                              }
                              className="app-button-ghost justify-between text-left text-xs"
                              onClick={() => select(value)}
                            >
                              <span className="min-w-0 break-words">
                                {value}
                              </span>
                              {(section === "labels"
                                ? labels.includes(value)
                                : filters[section] === value) && (
                                <Check size={13} className="shrink-0" />
                              )}
                            </button>
                          ))}
                      </div>
                      <button
                        type="button"
                        className="app-button-ghost w-full text-xs"
                        onClick={() => {
                          onChange(
                            section === "labels"
                              ? { labels: [] }
                              : { [section]: "", personal: "all" },
                          );
                          close();
                        }}
                      >
                        {t("tasks.clearFilters")}
                      </button>
                    </>
                  )}
                </div>
              );
            }
          : undefined
      }
    />
  );
}
