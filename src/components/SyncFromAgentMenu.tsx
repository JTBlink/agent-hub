import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import { AgentIcon } from "./AgentIcon";
import * as api from "../lib/tauri";
import type { ManagedSkill, ToolInfo } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { getAgentSyncSources } from "../lib/agentSync";

interface Props {
  currentAgentKey: string;
  tools: ToolInfo[];
  managedSkills: ManagedSkill[];
  onComplete: () => Promise<void>;
}

interface MenuPos {
  top: number;
  left: number;
}

export function SyncFromAgentMenu({
  currentAgentKey,
  tools,
  managedSkills,
  onComplete,
}: Props) {
  const { t } = useTranslation();
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [syncing, setSyncing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = pos !== null;

  const otherAgents = useMemo(
    () => getAgentSyncSources(currentAgentKey, tools, managedSkills),
    [currentAgentKey, tools, managedSkills],
  );

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (
        panelRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return;
      setPos(null);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPos(null);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleToggle = useCallback(() => {
    if (open) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 6, left: rect.left });
  }, [open]);

  const handleSync = useCallback(
    async (sourceAgent: {
      key: string;
      displayName: string;
      missingSkills: ManagedSkill[];
    }) => {
      if (sourceAgent.missingSkills.length === 0) return;
      setSyncing(true);
      setPos(null);
      try {
        let synced = 0;
        const failures: { name: string; reason: string }[] = [];
        for (const skill of sourceAgent.missingSkills) {
          try {
            await api.syncSkillToTool(skill.id, currentAgentKey);
            synced++;
          } catch (e) {
            failures.push({
              name: skill.name,
              reason: getErrorMessage(e, t("common.error")),
            });
          }
        }
        if (synced > 0) {
          toast.success(
            t("globalWorkspace.syncFromAgent.synced", {
              count: synced,
              agent: sourceAgent.displayName,
            }),
          );
        }
        if (failures.length > 0) {
          const detail = failures
            .map((f) => `• ${f.name}: ${f.reason}`)
            .join("\n");
          toast.error(
            t("globalWorkspace.syncFromAgent.failed", {
              count: failures.length,
            }),
            { description: detail },
          );
        }
        await onComplete();
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, t("common.error")));
      } finally {
        setSyncing(false);
      }
    },
    [currentAgentKey, onComplete, t],
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        disabled={syncing || otherAgents.length === 0}
        className={cn(
          "rounded-md p-2 text-muted transition-colors hover:text-tertiary focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50",
          open && "bg-surface-active text-secondary",
        )}
        title={t("globalWorkspace.syncFromAgent.button")}
        aria-label={t("globalWorkspace.syncFromAgent.title")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {syncing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowRightLeft className="h-4 w-4" />
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            className="fixed z-50 max-h-[60vh] overflow-y-auto min-w-[240px] rounded-lg border border-border bg-surface p-1.5 shadow-xl"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wider text-faint">
              {t("globalWorkspace.syncFromAgent.heading")}
            </div>
            {otherAgents.map((agent) => (
              <button
                key={agent.key}
                role="menuitem"
                type="button"
                disabled={agent.missingCount === 0}
                onClick={() => void handleSync(agent)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-hover disabled:opacity-40"
              >
                <AgentIcon
                  agentKey={agent.key}
                  displayName={agent.displayName}
                  className="h-5 w-5 shrink-0 rounded"
                />
                <span className="min-w-0 flex-1 truncate">
                  {agent.displayName}
                </span>
                {agent.missingCount > 0 ? (
                  <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                    +{agent.missingCount}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-faint">
                    {t("globalWorkspace.syncFromAgent.upToDate")}
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
