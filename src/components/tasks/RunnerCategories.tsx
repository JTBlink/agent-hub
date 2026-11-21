import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskBinding } from "../../lib/taskBrowserApi";
import { SingleChoiceGroup } from "../SingleChoiceGroup";
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
  showAssignable,
  count,
  projects,
  onChange,
  onCreated,
}: {
  value: RunnerCategory;
  showAssignable: boolean;
  count: (category: RunnerCategory) => number;
  projects: TaskBinding[];
  onChange: (category: RunnerCategory) => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2">
      <div className="min-w-0 overflow-x-auto">
        <SingleChoiceGroup
          label={t("runners.categories.label")}
          value={value}
          onChange={onChange}
          options={categories
            .filter((category) => category !== "assignable" || showAssignable)
            .map((category) => ({
              value: category,
              label: `${t(`runners.categories.${category}`)} (${count(category)})`,
            }))}
        />
      </div>
      {projects.length > 0 && (
        <button
          type="button"
          className="app-button-secondary gap-1.5 text-xs"
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
