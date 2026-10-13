import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAgentSettings } from "../../hooks/useAgentSettings";
import * as api from "../../lib/tauri";
import { AddCustomAgentForm } from "./AddCustomAgentForm";
import { AgentGroupDnd } from "./AgentGroupDnd";
import { AgentSettingsCard } from "./AgentSettingsCard";

export function AgentsSettings() {
  const { t } = useTranslation();
  const controller = useAgentSettings();
  const {
    tools,
    refreshing,
    showAddCustom,
    setShowAddCustom,
    showMoreAgents,
    setShowMoreAgents,
    handleRefresh,
    handleToggleAllTools,
    installedTools,
    enabledTools,
    customTools,
    detectedTools,
    undetectedTools,
    dragSensors,
    handleAgentDragEnd,
  } = controller;
  const renderAgentCard = (
    agent: api.ToolInfo,
    dragHandle?: React.ReactNode,
  ) => (
    <AgentSettingsCard
      agent={agent}
      dragHandle={dragHandle}
      controller={controller}
    />
  );
  return (
    <section
      id="agents"
      tabIndex={-1}
      className="scroll-mt-4 outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="app-section-title">
            {t("settings.supportedAgents")} ({installedTools.length}/
            {tools.length})
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowAddCustom(true)}
            className="flex items-center gap-1 text-[13px] text-accent hover:text-accent-light transition-colors font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("settings.addCustomAgent")}
          </button>
          <button
            onClick={() => handleToggleAllTools(true)}
            className="text-[13px] text-accent hover:text-accent-light transition-colors font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t("settings.enableAll")}
          </button>
          <button
            onClick={() => handleToggleAllTools(false)}
            className="text-[13px] text-muted hover:text-secondary transition-colors font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t("settings.disableAll")}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-[13px] text-accent hover:text-accent-light transition-colors font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {refreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {t("settings.refresh")}
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <span>
          {t("settings.detectedAgents")}{" "}
          <span className="font-medium text-secondary">
            {installedTools.length}
          </span>
        </span>
        <span>
          {t("settings.enabledAgents")}{" "}
          <span className="font-medium text-secondary">
            {enabledTools.length}
          </span>
        </span>
        <span>
          {t("settings.customAgents")}{" "}
          <span className="font-medium text-secondary">
            {customTools.length}
          </span>
        </span>
      </div>

      {showAddCustom && <AddCustomAgentForm controller={controller} />}

      <div className="space-y-4">
        {detectedTools.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-medium text-secondary">
                {t("settings.detectedAgentsSection")}
              </h3>
              <span className="text-[12px] text-muted tabular-nums">
                {detectedTools.length}
              </span>
            </div>
            <AgentGroupDnd
              items={detectedTools}
              sensors={dragSensors}
              dragLabel={t("settings.dragToReorder")}
              onDragEnd={handleAgentDragEnd}
              renderAgentCard={renderAgentCard}
            />
          </div>
        )}

        {undetectedTools.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowMoreAgents((value) => !value)}
              className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {showMoreAgents ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {t("settings.otherAgentsSection", {
                count: undetectedTools.length,
              })}
            </button>
            {showMoreAgents && (
              <AgentGroupDnd
                items={undetectedTools}
                sensors={dragSensors}
                dragLabel={t("settings.dragToReorder")}
                onDragEnd={handleAgentDragEnd}
                renderAgentCard={renderAgentCard}
              />
            )}
          </div>
        )}

        {customTools.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-medium text-secondary">
                {t("settings.customAgentsSection")}
              </h3>
              <span className="text-[12px] text-muted">
                {customTools.length}
              </span>
            </div>
            <AgentGroupDnd
              items={customTools}
              sensors={dragSensors}
              dragLabel={t("settings.dragToReorder")}
              onDragEnd={handleAgentDragEnd}
              renderAgentCard={renderAgentCard}
            />
          </div>
        )}
      </div>
    </section>
  );
}
