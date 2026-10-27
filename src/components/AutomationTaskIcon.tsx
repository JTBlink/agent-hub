import { useState } from "react";
import { Clock3, SquareTerminal } from "lucide-react";
import type { AutomationTask } from "../lib/tauri";
import { AgentIcon } from "./AgentIcon";
import { cn } from "../utils";

export function AutomationTaskIcon({
  task,
  className,
}: {
  task: AutomationTask;
  className?: string;
}) {
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  if (task.source === "hermes")
    return <AgentIcon agentKey="hermes" className={className} />;
  const Fallback = task.command ? SquareTerminal : Clock3;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        className,
      )}
    >
      {task.icon && task.icon !== failedIcon ? (
        <img
          src={task.icon}
          alt=""
          draggable={false}
          onError={() => setFailedIcon(task.icon)}
          className="h-full w-full object-contain"
        />
      ) : (
        <Fallback className="h-3/4 w-3/4 text-muted" />
      )}
    </span>
  );
}
