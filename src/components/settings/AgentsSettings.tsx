import { useState } from "react";
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
import { useAgentLaunchSettings } from "../../hooks/useAgentLaunchSettings";
import { AgentLaunchBackup } from "./AgentLaunchBackup";
import { CardActionMenu } from "../CardActionMenu";
import { AgentSettingsCard } from "./AgentSettingsCard";

export function AgentsSettings() {
  const { t } = useTranslation();
  const controller = useAgentSettings();
  const launch = useAgentLaunchSettings();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"installed" | "enabled" | "all">("all");
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
  const matching = (agents: api.ToolInfo[]) =>
    agents.filter((agent) => {
      const instruction =
        launch.snapshot?.document.instructions[agent.key] ??
        launch.snapshot?.defaults[agent.key] ??
        "";
      if (filter === "installed" && !agent.installed) return false;
      if (filter === "enabled" && (!agent.installed || !agent.enabled))
        return false;
      return `${agent.key} ${agent.display_name} ${instruction}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
    });
  const visibleDetected = matching(detectedTools);
  const visibleUndetected = matching(undetectedTools);
  const visibleCustom = matching(customTools);
  const renderAgentCard = (
    agent: api.ToolInfo,
    dragHandle?: React.ReactNode,
  ) => (
    <AgentSettingsCard
      agent={agent}
      dragHandle={dragHandle}
      controller={controller}
      launch={launch}
    />
  );
  return (
    <section
      id="agents"
      tabIndex={-1}
      className="scroll-mt-4 outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <h2 className="sr-only">{t("settings.supportedAgents")}</h2>
      <AgentLaunchBackup
        revision={launch.snapshot?.revision}
        onSynced={launch.reload}
      />
      <div className="mb-3 flex min-w-0 items-center gap-3">
        <div
          className="flex shrink-0 items-center gap-1"
          role="group"
          aria-label={t("agentLaunch.filter")}
        >
          {(["installed", "enabled", "all"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${filter === value ? "bg-surface-active text-primary" : "text-muted hover:bg-surface-hover hover:text-secondary"}`}
            >
              {t(`agentLaunch.filters.${value}`)}{" "}
              <span className="ml-1 text-xs tabular-nums">
                {value === "installed"
                  ? installedTools.length
                  : value === "enabled"
                    ? enabledTools.length
                    : tools.length}
              </span>
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label={t("agentLaunch.search")}
          placeholder={t("agentLaunch.search")}
          title={t("agentLaunch.description")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="app-input ml-auto min-w-0 max-w-sm flex-1"
        />
        <button
          type="button"
          onClick={() => setShowAddCustom(true)}
          title={`${t("settings.customAgents")}: ${customTools.length}`}
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("agentLaunch.addCustom")}
        </button>
        <CardActionMenu
          label={t("agentLaunch.more")}
          triggerIcon={
            <span className="whitespace-nowrap text-sm">
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                t("agentLaunch.more")
              )}
            </span>
          }
          triggerClassName="!h-8 !w-auto px-2"
          actions={[
            {
              key: "enable",
              label: t("settings.enableAll"),
              disabled: controller.togglingTools.size > 0,
              onSelect: () => void handleToggleAllTools(true),
            },
            {
              key: "disable",
              label: t("settings.disableAll"),
              disabled: controller.togglingTools.size > 0,
              onSelect: () => void handleToggleAllTools(false),
            },
            {
              key: "refresh",
              label: t("settings.refresh"),
              icon: <RefreshCw className="h-3.5 w-3.5" />,
              disabled: refreshing,
              onSelect: () => void handleRefresh(),
            },
          ]}
        />
      </div>
      {launch.error && (
        <div role="alert" className="mb-3 text-sm text-danger">
          {launch.error}{" "}
          <button
            type="button"
            className="text-accent"
            onClick={() => void launch.reload()}
          >
            {t("agentLaunch.reload")}
          </button>
        </div>
      )}
      {showAddCustom && <AddCustomAgentForm controller={controller} />}

      {visibleDetected.length +
        visibleUndetected.length +
        visibleCustom.length ===
        0 && (
        <p role="status" className="text-sm text-muted">
          {t("agentLaunch.noMatches")}
        </p>
      )}
      <div className="space-y-4">
        {visibleDetected.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-secondary">
                {t("settings.detectedAgentsSection")}
              </h3>
              <span className="text-xs text-muted tabular-nums">
                {detectedTools.length}
              </span>
            </div>
            <AgentGroupDnd
              layout="columns"
              items={visibleDetected}
              sensors={dragSensors}
              dragLabel={t("settings.dragToReorder")}
              onDragEnd={handleAgentDragEnd}
              renderAgentCard={renderAgentCard}
            />
          </div>
        )}

        {visibleUndetected.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowMoreAgents((value) => !value)}
              className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
            {(showMoreAgents || query.trim()) && (
              <AgentGroupDnd
                layout="columns"
                items={visibleUndetected}
                sensors={dragSensors}
                dragLabel={t("settings.dragToReorder")}
                onDragEnd={handleAgentDragEnd}
                renderAgentCard={renderAgentCard}
              />
            )}
          </div>
        )}

        {visibleCustom.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-secondary">
                {t("settings.customAgentsSection")}
              </h3>
              <span className="text-xs text-muted">{customTools.length}</span>
            </div>
            <AgentGroupDnd
              layout="columns"
              items={visibleCustom}
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
