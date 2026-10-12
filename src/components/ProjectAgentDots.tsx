import { useState } from "react";
import { ChevronUp, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProjectAgentTarget } from "../lib/tauri";
import { cn } from "../utils";
import { AgentIcon } from "./AgentIcon";
import { hasAgentIcon } from "../lib/agentIcons";

function shortLabel(displayName: string, key: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  const word = words[0] || key;
  return word.slice(0, 2).toUpperCase();
}

type DotState = "synced" | "available";

interface Props {
  assignedAgents: string[];
  targets: ProjectAgentTarget[];
  limit?: number;
  size?: "sm" | "md";
  className?: string;
  /**
   * When provided, each agent dot becomes a button: clicking adds/removes the
   * skill for that agent in the project. The handler receives the next state.
   */
  onToggle?: (agentKey: string, enabled: boolean) => void;
  /** Agent key currently performing an assign/remove operation; shows a loader on that dot. */
  pendingKey?: string | null;
}

export function ProjectAgentDots({
  assignedAgents,
  targets,
  limit,
  size = "md",
  className,
  onToggle,
  pendingKey,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const assignedSet = new Set(assignedAgents);
  // Local installation controls these shortcuts, including the overflow count.
  // Assigned team copies remain intact even when their host is not installed.
  const dots: { key: string; displayName: string; state: DotState }[] = targets
    .filter((target) => target.installed)
    .map((target) => ({
      key: target.key,
      displayName: target.display_name,
      state: assignedSet.has(target.key) ? "synced" : "available",
    }));

  const collapsedDots = typeof limit === "number" ? dots.slice(0, limit) : dots;
  const hiddenCount = dots.length - collapsedDots.length;
  const visible = onToggle && expanded ? dots : collapsedDots;

  const dim =
    size === "sm"
      ? "h-[16px] w-[16px] text-[8px]"
      : "h-[18px] w-[18px] text-[9px]";

  const iconStateClass: Record<DotState, string> = {
    synced: "bg-surface",
    available: "bg-surface opacity-45",
  };

  const textStateClass: Record<DotState, string> = {
    synced:
      "border-transparent bg-[var(--color-text-primary)] text-[var(--color-bg)]",
    available: "border border-border-subtle bg-surface-hover text-faint",
  };

  const stateTitle: Record<DotState, string> = {
    synced: " · assigned",
    available: " · available",
  };

  const clickHint: Record<DotState, string> = {
    synced: ` · ${t("project.agentClickRemove")}`,
    available: ` · ${t("project.agentClickAdd")}`,
  };

  return (
    <div
      className={cn(
        "flex items-center gap-[2px]",
        onToggle && expanded && "max-w-[160px] flex-wrap",
        className,
      )}
    >
      {visible.map((dot) => {
        const useIcon = hasAgentIcon(dot.key);
        const isPending = pendingKey === dot.key;
        const interactive = !!onToggle && !isPending;
        const title = `${dot.displayName}${stateTitle[dot.state]}${onToggle ? clickHint[dot.state] : ""}`;
        const baseClass = cn(
          "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-[4px] transition-colors",
          dim,
          useIcon
            ? iconStateClass[dot.state]
            : cn(
                "border font-mono font-semibold tracking-tight",
                textStateClass[dot.state],
              ),
          interactive &&
            "cursor-pointer hover:ring-1 hover:ring-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          isPending && "opacity-70",
        );
        const content = isPending ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted" />
        ) : useIcon ? (
          <AgentIcon
            agentKey={dot.key}
            className="h-full w-full rounded-[4px] border-0 bg-transparent"
          />
        ) : (
          shortLabel(dot.displayName, dot.key)
        );

        if (onToggle) {
          return (
            <button
              type="button"
              key={dot.key}
              title={title}
              aria-label={title}
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle(dot.key, dot.state === "available");
              }}
              className={baseClass}
            >
              {content}
            </button>
          );
        }

        return (
          <span key={dot.key} title={title} className={baseClass}>
            {content}
          </span>
        );
      })}
      {hiddenCount > 0 &&
        (onToggle ? (
          <button
            type="button"
            title={t(expanded ? "common.collapse" : "common.expandAll")}
            aria-label={t(expanded ? "common.collapse" : "common.expandAll")}
            aria-expanded={expanded}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded((value) => !value);
            }}
            className={cn(
              "inline-flex shrink-0 select-none items-center justify-center rounded-[4px] border border-border-subtle bg-surface-hover font-mono font-semibold text-faint hover:ring-1 hover:ring-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              dim,
            )}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : `+${hiddenCount}`}
          </button>
        ) : (
          <span
            title={`+${hiddenCount} more agents`}
            className={cn(
              "inline-flex shrink-0 select-none items-center justify-center rounded-[4px] border border-border-subtle bg-surface-hover font-mono font-semibold text-faint",
              dim,
            )}
          >
            +{hiddenCount}
          </span>
        ))}
    </div>
  );
}
