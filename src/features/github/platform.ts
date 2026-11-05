import { Github } from "lucide-react";
import type { TaskPlatform } from "../../integrations/platforms/types";
export const githubPlatform: TaskPlatform = {
  id: "github",
  label: "GitHub",
  host: "github.com",
  icon: Github,
};
