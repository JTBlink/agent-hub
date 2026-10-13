import { Check, FolderOpen, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "../../components/AgentIcon";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { useAgentSettings } from "../../hooks/useAgentSettings";
import { isEnabledInstalledAgent } from "../../lib/agentAvailability";
import * as api from "../../lib/tauri";
import { cn, compactHomePath } from "../../utils";

export function AgentSettingsCard({
  agent,
  dragHandle,
  controller,
}: {
  agent: api.ToolInfo;
  dragHandle?: React.ReactNode;
  controller: ReturnType<typeof useAgentSettings>;
}) {
  const { t } = useTranslation();
  const {
    togglingTools,
    savingPath,
    editingPathKey,
    setEditingPathKey,
    editingPathValue,
    setEditingPathValue,
    editingProjectPathKey,
    setEditingProjectPathKey,
    editingProjectPathValue,
    setEditingProjectPathValue,
    startEditPath,
    handleSavePath,
    startEditProjectPath,
    handleSaveProjectPath,
    handleResetProjectPath,
    handleResetPath,
    handleBrowsePath,
    handleRemoveCustomAgent,
    handleToggleTool,
  } = controller;
  return (
    <fieldset
      disabled={savingPath}
      className={cn(
        "group relative flex h-full flex-col gap-1.5 rounded-xl border px-3.5 py-3 transition-colors",
        isEnabledInstalledAgent(agent)
          ? "border-border bg-surface"
          : agent.installed
            ? "border-border-subtle bg-surface"
            : "border-border-subtle bg-bg-secondary",
      )}
    >
      <div className="flex items-start gap-2.5">
        {dragHandle}
        <AgentIcon
          agentKey={agent.key}
          displayName={agent.display_name}
          className="mt-px h-6 w-6 shrink-0 rounded-md"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className={cn(
                "truncate text-[14px] font-semibold",
                agent.installed ? "text-primary" : "text-muted",
              )}
            >
              {agent.display_name}
            </h3>
            {/* Enabled/disabled is carried by the switch; only "not installed" adds info. */}
            {!agent.installed && (
              <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-muted">
                {t("settings.notInstalled")}
              </span>
            )}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {agent.is_custom && (
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                {t("settings.customAgent")}
              </span>
            )}
            {agent.is_custom && agent.project_relative_skills_dir && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                {t("settings.projectAgentSupported")}
              </span>
            )}
            {agent.has_path_override && !agent.is_custom && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                {t("settings.pathOverridden")}
              </span>
            )}
          </div>
        </div>

        {agent.is_custom && (
          <button
            onClick={() =>
              handleRemoveCustomAgent(agent.key, agent.display_name)
            }
            className="mt-0.5 shrink-0 p-0.5 text-muted opacity-0 outline-none focus-visible:ring-2 focus-visible:ring-accent transition-opacity hover:text-red-500 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
            title={t("settings.removeCustomAgent")}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}

        <ToggleSwitch
          className="mt-0.5"
          checked={isEnabledInstalledAgent(agent)}
          disabled={!agent.installed}
          loading={togglingTools.has(agent.key)}
          onChange={() => handleToggleTool(agent.key, !agent.enabled)}
          title={
            !agent.installed
              ? (t("settings.notInstalled") as string)
              : agent.enabled
                ? (t("settings.disableAgent") as string)
                : (t("settings.enableAgent") as string)
          }
        />
      </div>

      <div className="space-y-1">
        {/* Global skills path */}
        {editingPathKey === agent.key ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              aria-label={t("settings.skillsPath")}
              value={editingPathValue}
              onChange={(e) => setEditingPathValue(e.target.value)}
              className="h-7 min-w-0 flex-1 rounded border border-border-subtle bg-background px-1.5 text-[12px] font-mono text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent focus:border-accent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSavePath();
                if (e.key === "Escape") setEditingPathKey(null);
              }}
            />
            <button
              onClick={() => handleBrowsePath(setEditingPathValue)}
              className="shrink-0 p-1 text-muted hover:text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent"
              title={t("settings.selectFolder")}
            >
              <FolderOpen className="h-3 w-3" />
            </button>
            <button
              aria-label={t("common.save")}
              onClick={handleSavePath}
              className="shrink-0 p-1 text-emerald-500 hover:text-emerald-400 outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              aria-label={t("common.cancel")}
              onClick={() => setEditingPathKey(null)}
              className="shrink-0 p-1 text-muted hover:text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <p
              className="min-w-0 flex-1 truncate text-[12px] font-mono leading-tight text-muted"
              title={agent.skills_dir}
            >
              {compactHomePath(agent.skills_dir)}
            </p>
            <button
              type="button"
              onClick={() => startEditPath(agent.key, agent.skills_dir)}
              className="shrink-0 p-0.5 text-muted hover:text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
              title={t("settings.editPath")}
            >
              <Pencil className="h-3 w-3" />
            </button>
            {agent.has_path_override && !agent.is_custom && (
              <button
                type="button"
                onClick={() => handleResetPath(agent.key)}
                className="shrink-0 p-0.5 text-muted hover:text-amber-500 outline-none focus-visible:ring-2 focus-visible:ring-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                title={t("settings.resetPath")}
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Project-relative skills path — always rendered so every card is the
            same height, installed or not. */}
        {editingProjectPathKey === agent.key ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              aria-label={t("settings.projectSkillsPath")}
              value={editingProjectPathValue}
              onChange={(e) => setEditingProjectPathValue(e.target.value)}
              placeholder={t("settings.projectSkillsPathPlaceholder")}
              className="h-7 min-w-0 flex-1 rounded border border-border-subtle bg-background px-1.5 text-[12px] font-mono text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent focus:border-accent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveProjectPath();
                if (e.key === "Escape") setEditingProjectPathKey(null);
              }}
            />
            <button
              aria-label={t("common.save")}
              onClick={handleSaveProjectPath}
              className="shrink-0 p-1 text-emerald-500 hover:text-emerald-400 outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              aria-label={t("common.cancel")}
              onClick={() => setEditingProjectPathKey(null)}
              className="shrink-0 p-1 text-muted hover:text-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <p
              className="min-w-0 flex-1 truncate text-[12px] font-mono leading-tight text-muted"
              title={
                agent.project_relative_skills_dir ??
                t("settings.projectSkillsPathDesc")
              }
            >
              {agent.project_relative_skills_dir
                ? !agent.is_custom && !agent.has_project_path_override
                  ? t("settings.projectSkillsPathDefault", {
                      path: agent.project_relative_skills_dir,
                    })
                  : t("settings.projectSkillsPathValue", {
                      path: agent.project_relative_skills_dir,
                    })
                : t("settings.projectSkillsPathEmpty")}
            </p>
            <button
              type="button"
              onClick={() =>
                startEditProjectPath(
                  agent.key,
                  agent.project_relative_skills_dir,
                )
              }
              className="shrink-0 p-0.5 text-muted hover:text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
              title={t("settings.editPath")}
            >
              <Pencil className="h-3 w-3" />
            </button>
            {!agent.is_custom && agent.has_project_path_override && (
              <button
                type="button"
                onClick={() => handleResetProjectPath(agent.key)}
                className="shrink-0 p-0.5 text-muted hover:text-amber-500 outline-none focus-visible:ring-2 focus-visible:ring-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                title={t("settings.resetPath")}
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </fieldset>
  );
}
