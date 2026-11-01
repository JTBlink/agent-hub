import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getManagedSkills, getProjectSkills } from "../lib/tauri";
import { taskSkillOptions, type TaskSkill } from "../lib/taskPrompt";
import { getErrorMessage } from "../lib/error";

/** One batch per dialog/project; filtering the picker never scans again. */
export function useTaskStartSkills(projectId: string) {
  const { t } = useTranslation();
  const fallback = t("common.error");
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    options: TaskSkill[];
    loading: boolean;
    error: string;
  }>({ options: [], loading: true, error: "" });
  useEffect(() => {
    let disposed = false;
    void Promise.allSettled([
      getManagedSkills(),
      getProjectSkills(projectId),
    ]).then(([library, project]) => {
      if (disposed) return;
      setState({
        options: taskSkillOptions(
          library.status === "fulfilled" ? library.value : [],
          project.status === "fulfilled" ? project.value : [],
        ),
        loading: false,
        error: [library, project]
          .flatMap((result) =>
            result.status === "rejected"
              ? [getErrorMessage(result.reason, fallback)]
              : [],
          )
          .join("\n"),
      });
    });
    return () => {
      disposed = true;
    };
  }, [projectId, retry, fallback]);
  return {
    ...state,
    refresh: () => {
      setState((previous) => ({ ...previous, loading: true, error: "" }));
      setRetry((value) => value + 1);
    },
  };
}
