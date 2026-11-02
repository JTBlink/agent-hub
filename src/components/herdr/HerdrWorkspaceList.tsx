import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HerdrPane, HerdrWorkspace } from "../../lib/herdrControlApi";
import { HerdrWorkspaceRow } from "./HerdrWorkspaceRow";

import { groupHerdrWorkspaces } from "../../lib/herdrWorkspaces";

export function HerdrWorkspaceList({
  spaces,
  agents,
  selected,
  disabled,
  onOpen,
}: {
  spaces: HerdrWorkspace[];
  agents: HerdrPane[];
  selected?: string;
  disabled: boolean;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { roots, children } = groupHerdrWorkspaces(spaces);
  const row = (space: HerdrWorkspace) => (
    <HerdrWorkspaceRow
      workspace={space}
      agents={agents.filter(
        (agent) => agent.workspace_id === space.workspace_id,
      )}
      selected={selected === space.workspace_id}
      disabled={disabled}
      onOpen={() => onOpen(space.workspace_id)}
    />
  );
  return roots.map((space) => {
    const linked = children.get(space.workspace_id) ?? [];
    const expanded = !collapsed.has(space.workspace_id);
    return (
      <div key={space.workspace_id}>
        <div className="relative">
          <div className={linked.length ? "pr-6" : undefined}>{row(space)}</div>
          {linked.length > 0 && (
            <button
              className="app-button-ghost absolute right-1 top-1.5 rounded p-1 focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={t("herdr.worktrees", { name: space.label })}
              aria-expanded={expanded}
              onClick={() =>
                setCollapsed((previous) => {
                  const next = new Set(previous);
                  if (expanded) next.add(space.workspace_id);
                  else next.delete(space.workspace_id);
                  return next;
                })
              }
            >
              {expanded ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
            </button>
          )}
        </div>
        {expanded && linked.length > 0 && (
          <div className="ml-4 pl-3">
            {linked.map((child) => (
              <div
                key={child.workspace_id}
                className="relative before:pointer-events-none before:absolute before:-left-3 before:bottom-0 before:top-0 before:border-l-2 before:border-current before:text-muted last:before:bottom-auto last:before:h-3"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-3 top-3 h-0 w-3 border-t-2 border-current text-muted"
                />
                {row(child)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  });
}
