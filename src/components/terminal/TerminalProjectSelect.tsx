import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Project } from "../../lib/tauri";
import { worktreeUrl } from "../../lib/worktreeApi";
import { ThemedSelect } from "../ThemedSelect";

/** The unscoped terminal follows the same project checkout route as the workbench. */
export function TerminalProjectSelect({
  projects,
  selected,
}: {
  projects: Project[];
  selected: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <ThemedSelect
      aria-label={t("terminal.chooseProject")}
      value={selected}
      title={projects.find((project) => project.id === selected)?.name}
      onChange={(event) => {
        const project = projects.find((item) => item.id === event.target.value);
        if (project) navigate(worktreeUrl(project.id, project.path));
      }}
      className="h-7 max-w-40 gap-2 rounded-md border-transparent bg-transparent px-2 py-0 text-xs"
    >
      {!projects.length && (
        <option value="">{t("terminal.chooseProject")}</option>
      )}
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </ThemedSelect>
  );
}
