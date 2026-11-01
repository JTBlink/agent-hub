import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ProjectDetail } from "./ProjectDetail";

export function ProjectSkills() {
  const { id } = useParams();
  const { search } = useLocation();
  const { t } = useTranslation();
  return (
    <>
      <Link
        to={`/project/${id}${search}`}
        className="app-button-ghost self-start gap-2 text-xs"
      >
        <ArrowLeft size={14} />
        {t("worktree.back")}
      </Link>
      <ProjectDetail />
    </>
  );
}
