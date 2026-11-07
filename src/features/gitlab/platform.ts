import { Gitlab } from "lucide-react";
import type { TaskPlatform } from "../../integrations/platforms/types";
export const gitlabPlatform: TaskPlatform = {
  id: "gitlab",
  label: "GitLab",
  host: "gitlab.com",
  accounts: { cli: "glab", switchMode: "login" },
  icon: Gitlab,
};
