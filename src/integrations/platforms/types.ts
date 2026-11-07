import type { ComponentType } from "react";
import type { TaskProvider } from "../../lib/taskBrowserApi";
export interface TaskPlatform {
  id: TaskProvider;
  label: string;
  host: string;
  accounts: {
    cli: string;
    switchMode: "saved" | "login";
    parseAuthChallenge?: (
      screen: string,
      host: string,
    ) => { code: string; url: string; enterToOpen: boolean } | null;
  };
  icon: ComponentType<{ className?: string }>;
}
