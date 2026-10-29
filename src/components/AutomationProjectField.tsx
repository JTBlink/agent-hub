import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getProjects, type Project } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { AutomationWorkdirField } from "./AutomationWorkdirField";

export function AutomationProjectField({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled: boolean;
  onChange: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void getProjects().then(
      (projects) => {
        if (active) {
          setProjects(projects);
          setLoading(false);
        }
      },
      (cause) => {
        if (active) {
          setError(getErrorMessage(cause, ""));
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <div className="space-y-3">
      <AutomationWorkdirField
        kind="projectWorkspace"
        value={value}
        disabled={disabled}
        projects={projects}
        projectsLoading={loading}
        onChange={onChange}
      />
      {error && (
        <div role="alert" className="text-[11px] text-danger">
          {error}{" "}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setLoading(true);
              setError(null);
              setAttempt((value) => value + 1);
            }}
            className="underline"
          >
            {t("automation.refresh")}
          </button>
        </div>
      )}
    </div>
  );
}
