import { githubAuthChallenge } from "./authChallenge";
import { Github } from "lucide-react";
import type { TaskPlatform } from "../../integrations/platforms/types";
export const githubPlatform: TaskPlatform = {
  id: "github",
  label: "GitHub",
  host: "github.com",
  accounts: {
    cli: "gh",
    switchMode: "saved",
    parseAuthChallenge: githubAuthChallenge,
  },
  icon: Github,
};
