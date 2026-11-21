import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskBinding } from "../../lib/taskBrowserApi";
import { ThemedSelect } from "../ThemedSelect";
import { CreateProjectRunnerDialog } from "./CreateProjectRunnerDialog";

const categories = [
  "assigned",
  "assignable",
  "group",
  "instance",
  "all",
] as const;
export type RunnerCategory = (typeof categories)[number];

export function RunnerCategories({
  value,
  showCategories,
  children,
  showAssignable,
  count,
  projects,
  onChange,
  onCreated,
}: {
  value: RunnerCategory;
  showCategories: boolean;
  children: ReactNode;
  showAssignable: boolean;
  count: (category: RunnerCategory) => number;
  projects: TaskBinding[];
  onChange: (category: RunnerCategory) => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  return (
    <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
      {showCategories && (
        <ThemedSelect
          className="h-7 w-56 max-w-full gap-2 py-0 text-xs"
          aria-label={t("runners.categories.label")}
          value={value}
          onChange={(event) => {
            const next = categories.find(
              (category) => category === event.target.value,
            );
            if (next) onChange(next);
          }}
        >
          {categories
            .filter((category) => category !== "assignable" || showAssignable)
            .map((category) => (
              <option key={category} value={category}>
                {`${t(`runners.categories.${category}`)} (${count(category)})`}
              </option>
            ))}
        </ThemedSelect>
      )}
      {children}
      {projects.length > 0 && (
        <button
          type="button"
          className="app-button-secondary ml-auto h-7 shrink-0 gap-1.5 whitespace-nowrap text-xs"
          onClick={() => setCreating(true)}
        >
          <Plus size={14} aria-hidden="true" />
          {t("runners.create.title")}
        </button>
      )}
      {creating && (
        <CreateProjectRunnerDialog
          projects={projects}
          onCreated={onCreated}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
