import { MANAGE_SKILLS_SOURCE } from "./distribution";

export interface RecommendedSkill {
  skill_id: string;
  name: string;
  source: string;
  description: string;
  tag: string;
  install_url: string;
}

export const RECOMMENDED_SKILLS: RecommendedSkill[] = [
  {
    skill_id: "manage-skills",
    name: "manage-skills",
    source: "JTBlink/agent-hub",
    description:
      "通过 agent-hub-cli 管理共享技能库——安装、更新、部署、技能组、标签与多 Agent 同步。",
    tag: "Agent 工作流",
    install_url: MANAGE_SKILLS_SOURCE,
  },
];
