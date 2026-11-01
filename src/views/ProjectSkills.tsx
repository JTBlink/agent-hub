import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ProjectSkillsPanel,
  ProjectSkillsToolbar,
} from "../components/worktree/ProjectSkillsPanel";

export function ProjectSkills() {
  const { id } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <ProjectSkillsToolbar
        onClose={() => navigate(`/project/${id}${search}`)}
      />
      {id && <ProjectSkillsPanel projectId={id} />}
    </>
  );
}
