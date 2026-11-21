import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Layers, RefreshCw, Settings2 } from "lucide-react";
import { taskPlatforms } from "@app/platforms";
import { PlatformAccountButton } from "../../../src/components/accounts/PlatformAccountButton";
import { AppDialog } from "../../../src/components/AppDialog";
import { HelpTooltip } from "../../../src/components/HelpTooltip";
import { RepositoryPlatformIcon } from "../../../src/components/RepositoryPlatformIcon";
import { TaskConnections } from "../../../src/components/tasks/TaskConnections";
import { ThemedSelect } from "../../../src/components/ThemedSelect";
import type { TaskProvider } from "../../../src/lib/taskBrowserApi";
import { bindings, taskProjects } from "./task-demo";

export function RunnerHeader({
  projectSummary,
  provider,
  onProvider,
  hosts,
  includeGitHub,
  refreshing,
  onRefresh,
}: {
  projectSummary: ReactNode;
  provider: TaskProvider | "all";
  onProvider: (provider: TaskProvider | "all") => void;
  hosts: string[];
  includeGitHub: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [connections, setConnections] = useState(false);
  const context = hosts.map((host) => `${host} · demo`).join(" · ");
  const providerIcon = (id: string) =>
    id === "all" ? (
      <Layers size={16} aria-hidden="true" />
    ) : (
      <RepositoryPlatformIcon
        providers={taskPlatforms
          .filter((item) => item.id === id)
          .map((item) => item.id)}
        fallbackLabel={t("tasks.provider")}
      />
    );
  return (
    <div className="project-header-region">
      <div className="runner-header">
        <div className="project-page-title">
          <h1>Runner</h1>
          {projectSummary}
        </div>
        <ThemedSelect
          aria-label={t("tasks.provider")}
          className="h-7 w-36 gap-2 py-0 text-xs"
          value={provider}
          leadingIcon={providerIcon(provider)}
          optionIcon={providerIcon}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "all") onProvider(value);
            else {
              const platform = taskPlatforms.find((item) => item.id === value);
              if (platform) onProvider(platform.id);
            }
          }}
        >
          <option value="all">{t("tasks.allProviders")}</option>
          {taskPlatforms.map((platform) => (
            <option value={platform.id} key={platform.id}>
              {platform.label}
            </option>
          ))}
        </ThemedSelect>
        <div className="runner-source">
          {context && (
            <span className="source-platform" title={context}>
              {context}
            </span>
          )}
          {includeGitHub && (
            <HelpTooltip
              label="GitHub 自托管 Runner 说明"
              triggerContent={
                <span className="runner-scope">GitHub 仅自托管</span>
              }
            >
              GitHub 仅展示仓库可见的自托管 Runner。托管 Runner 按任务分配，
              不提供在线机器列表。
            </HelpTooltip>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="app-button-ghost h-7 w-7 p-0"
            title={t("settings.refresh")}
            aria-label={t("settings.refresh")}
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw
              size={15}
              aria-hidden="true"
              className={refreshing ? "spin" : ""}
            />
          </button>
          <PlatformAccountButton
            provider={provider}
            refreshKey={0}
            onClick={() => setAccountsOpen(true)}
          />
          <button
            type="button"
            className={`app-button-ghost h-7 w-7 p-0 ${connections ? "bg-surface-active text-primary" : ""}`}
            title={t("tasks.connections")}
            aria-label={t("tasks.connections")}
            aria-expanded={connections}
            onClick={() => setConnections(!connections)}
          >
            <Settings2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      {accountsOpen && (
        <AppDialog
          title={t("tasks.accounts")}
          onClose={() => setAccountsOpen(false)}
        >
          <p className="mb-3 text-xs text-secondary">演示账号</p>
          <ul className="space-y-2 text-sm">
            {[
              ...new Set(
                bindings
                  .filter(
                    (binding) =>
                      provider === "all" || binding.provider === provider,
                  )
                  .map((binding) => binding.host),
              ),
            ].map((host) => (
              <li key={host}>{host} · @demo</li>
            ))}
          </ul>
        </AppDialog>
      )}
      {connections && (
        <TaskConnections
          projects={taskProjects}
          bindings={bindings}
          onChanged={async () => {}}
          onClose={() => setConnections(false)}
        />
      )}
    </div>
  );
}
