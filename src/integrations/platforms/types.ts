import type { ComponentType } from "react";
import type { TaskProvider } from "../../lib/taskBrowserApi";
export interface TaskPlatform {
  id: TaskProvider;
  label: string;
  host: string;
  icon: ComponentType<{ className?: string }>;
}
