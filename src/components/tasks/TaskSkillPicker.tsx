import { useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskSkill } from "../../lib/taskPrompt";

export function TaskSkillPicker({
  options,
  selected,
  loading,
  error,
  disabled,
  onChange,
  onRetry,
}: {
  options: TaskSkill[];
  selected: TaskSkill[];
  loading: boolean;
  error: string;
  disabled: boolean;
  onChange: (skills: TaskSkill[]) => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const matching = options.filter((skill) =>
    `${skill.name} ${skill.description ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const known = new Set(options.map((skill) => skill.id));
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <legend className="text-sm">
        {t("tasks.launch.skills")}{" "}
        <span className="text-xs text-muted">
          {selected.length || t("tasks.launch.optional")}
        </span>
      </legend>
      {!!selected.length && (
        <div className="flex flex-wrap gap-1">
          {selected.map((skill) => (
            <button
              key={skill.id}
              type="button"
              className="app-button-secondary h-7 max-w-full gap-1 px-2 text-xs"
              title={skill.entryPath}
              aria-label={t("tasks.launch.removeSkill", { name: skill.name })}
              onClick={() =>
                onChange(selected.filter((item) => item.id !== skill.id))
              }
            >
              <span className="truncate">
                {skill.name}
                {!loading && !known.has(skill.id)
                  ? ` · ${t("tasks.launch.skillUnavailable")}`
                  : ""}
              </span>
              <X size={12} className="shrink-0" />
            </button>
          ))}
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-xs text-muted">
          {t("tasks.launch.chooseSkills")}
        </summary>
        <input
          aria-label={t("tasks.launch.searchSkills")}
          placeholder={t("tasks.launch.searchSkills")}
          className="app-input my-2 h-8 w-full text-xs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {loading ? (
          <p role="status" className="text-xs text-muted">
            {t("common.loading")}
          </p>
        ) : (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {matching.slice(0, 80).map((skill) => (
              <label
                key={skill.id}
                className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-surface-hover"
                title={skill.entryPath}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={selected.some((item) => item.id === skill.id)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, skill]
                        : selected.filter((item) => item.id !== skill.id),
                    )
                  }
                />
                <span className="min-w-0 text-xs">
                  <span className="break-words font-medium">{skill.name}</span>
                  <span className="ml-1 text-muted">
                    {t(`tasks.launch.skillSource.${skill.source}`)}
                  </span>
                  {skill.description && (
                    <span className="block truncate text-muted">
                      {skill.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
        {!loading && matching.length === 0 && (
          <p className="text-xs text-muted">{t("tasks.launch.noSkills")}</p>
        )}
        {matching.length > 80 && (
          <p className="text-xs text-muted">{t("tasks.launch.refineSkills")}</p>
        )}
      </details>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}{" "}
          <button type="button" className="underline" onClick={onRetry}>
            {t("common.retry")}
          </button>
        </p>
      )}
      <p className="text-xs leading-5 text-muted">
        {t("tasks.launch.skillsHint")}
      </p>
    </fieldset>
  );
}
