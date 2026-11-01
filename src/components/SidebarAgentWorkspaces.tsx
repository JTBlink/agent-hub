import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Globe, GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import type { ToolInfo } from "../lib/tauri";
import { useWorkspaceSkills } from "../hooks/useWorkspaceSkills";
import {
  agentWorkspacePath,
  orderedWorkspaceAgents,
  WORKSPACE_AGENT_ORDER_KEYS,
} from "../lib/workspaceAgents";
import { readAgentOrder, reorderSidebarAgents } from "../lib/sidebarAgentOrder";
import { SidebarSectionHeader } from "./SidebarSectionHeader";
import { AgentIcon } from "./AgentIcon";

const CODING_ORDER_KEY = WORKSPACE_AGENT_ORDER_KEYS.coding;
const LOBSTER_ORDER_KEY = WORKSPACE_AGENT_ORDER_KEYS.lobster;

export function SidebarAgentWorkspaces({
  tools,
  isOpen,
  onToggle,
}: {
  tools: ToolInfo[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [codingOrder, setCodingOrder] = useState(() =>
    readAgentOrder(CODING_ORDER_KEY),
  );
  const [lobsterOrder, setLobsterOrder] = useState(() =>
    readAgentOrder(LOBSTER_ORDER_KEY),
  );
  const orderedTools = useMemo(
    () => orderedWorkspaceAgents(tools, codingOrder, lobsterOrder),
    [tools, codingOrder, lobsterOrder],
  );
  const { skillsByAgent } = useWorkspaceSkills(
    orderedTools.map((tool) => tool.key),
    null,
  );

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index)
      return;
    const reordered = reorderSidebarAgents(
      orderedTools,
      result.source.index,
      result.destination.index,
    );
    const category = orderedTools[result.source.index]?.category;
    if (!category) return;
    const order = reordered
      .filter((tool) => tool.category === category)
      .map((tool) => tool.key);
    if (category === "lobster") {
      setLobsterOrder(order);
      localStorage.setItem(LOBSTER_ORDER_KEY, JSON.stringify(order));
    } else {
      setCodingOrder(order);
      localStorage.setItem(CODING_ORDER_KEY, JSON.stringify(order));
    }
  };

  const group = {
    headingLabel: t("sidebar.globalWorkspace"),
    allAgentsLabel: t("globalWorkspace.allAgents"),
    emptyLabel: t("globalWorkspace.noAgents"),
    basePath: "/global-workspace",
    droppableId: "global-workspace-tools",
    tools: orderedTools,
    isOpen,
    onToggle,
  };
  return (
    <>
      <SidebarSectionHeader
        label={group.headingLabel}
        isOpen={group.isOpen}
        onToggle={group.onToggle}
      />
      {group.isOpen && (
        <>
          {/* Pinned overview item */}
          {(() => {
            const isActive = location.pathname === group.basePath;
            return (
              <Link
                to={group.basePath}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-sm text-sm leading-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                  isActive
                    ? "bg-surface-active font-medium text-primary"
                    : "text-tertiary hover:text-secondary hover:bg-surface-hover",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    isActive
                      ? "border-accent/30 bg-accent/10 text-accent"
                      : "border-border bg-surface text-muted",
                  )}
                >
                  <Globe className="h-3 w-3" />
                </span>
                <span className="flex-1 truncate">{group.allAgentsLabel}</span>
              </Link>
            );
          })()}
          {group.tools.length === 0 ? (
            <p className="px-5 py-1.5 text-xs text-faint">{group.emptyLabel}</p>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId={group.droppableId}>
                {(droppableProvided) => (
                  <div
                    className="px-1"
                    ref={droppableProvided.innerRef}
                    {...droppableProvided.droppableProps}
                  >
                    {group.tools.map((tool, index) => {
                      const skillCount = skillsByAgent[tool.key]?.length ?? 0;
                      const isActive =
                        location.pathname === agentWorkspacePath(tool);
                      return (
                        <Draggable
                          key={tool.key}
                          draggableId={tool.key}
                          index={index}
                        >
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={cn(
                                "group relative flex items-center rounded-sm transition-colors",
                                isActive
                                  ? "bg-surface-active"
                                  : "hover:bg-surface-hover",
                              )}
                            >
                              <button
                                title={tool.display_name}
                                aria-current={isActive ? "page" : undefined}
                                onClick={() =>
                                  navigate(agentWorkspacePath(tool))
                                }
                                className={cn(
                                  "flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1 text-left text-sm leading-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                                  isActive
                                    ? "font-medium text-primary"
                                    : "text-tertiary group-hover:text-secondary",
                                )}
                              >
                                <AgentIcon
                                  agentKey={tool.key}
                                  displayName={tool.display_name}
                                  className={cn(
                                    "h-4 w-4 rounded border transition-colors",
                                    isActive
                                      ? "border-accent/30 bg-accent/10"
                                      : "group-hover:border-border",
                                  )}
                                />
                                <span className="flex-1 truncate">
                                  {tool.display_name}
                                </span>
                                <span className="ml-auto flex h-[18px] w-[32px] shrink-0 items-center justify-end group-hover:hidden">
                                  {skillCount > 0 && (
                                    <span
                                      className={cn(
                                        "min-w-[18px] rounded-full px-1.5 text-center text-xs font-medium leading-[18px] tabular-nums",
                                        isActive
                                          ? "bg-accent-bg text-accent-light"
                                          : "bg-surface-hover text-muted",
                                      )}
                                    >
                                      {skillCount}
                                    </span>
                                  )}
                                </span>
                              </button>
                              <div
                                className={cn(
                                  "absolute right-1 flex items-center rounded-md invisible opacity-0 transition-opacity group-hover:visible group-hover:opacity-100",
                                  isActive
                                    ? "bg-surface-active"
                                    : "bg-surface-hover",
                                )}
                              >
                                <div
                                  {...provided.dragHandleProps}
                                  className="rounded p-1 text-faint cursor-grab active:cursor-grabbing"
                                >
                                  <GripVertical className="h-3 w-3" />
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {droppableProvided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </>
      )}
    </>
  );
}
