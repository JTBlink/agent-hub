import { ExternalLink, Layers, RefreshCw, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { TaskBinding } from "../../lib/tauri";
import type { TaskViewPreferences } from "../../lib/taskViewPreferences";
import { WorkspaceToolbar } from "../WorkspaceToolbar";
import { ThemedSelect } from "../ThemedSelect";
import { RepositoryPlatformIcon } from "../RepositoryPlatformIcon";
import { PlatformAccountButton } from "../accounts/PlatformAccountButton";
import { cn } from "../../utils";
import { taskPlatforms } from "@app/platforms";

export interface TaskScopeToolbarProps {
  provider: TaskViewPreferences["provider"];
  identities: string[];
  loading: boolean;
  connections: boolean;
  accountRefresh: number;
  leading?: ReactNode;
  children?: ReactNode;
  repository?: TaskBinding;
  onProvider: (value: TaskViewPreferences["provider"]) => void;
  onRefresh: () => void;
  onConnections: () => void;
  onAccounts: () => void;
  onOpenRepository?: (binding: TaskBinding) => void;
}

export function TaskScopeToolbar({
  provider,
  identities,
  loading,
  connections,
  accountRefresh,
  leading,
  children,
  repository,
  onProvider,
  onRefresh,
  onConnections,
  onAccounts,
  onOpenRepository,
}: TaskScopeToolbarProps) {
  const { t } = useTranslation();
  const context = identities.join(" · ");
  const providerIcon = (id: string) =>
    id === "all" ? (
      <Layers size={16} aria-hidden="true" />
    ) : (
      <RepositoryPlatformIcon
        providers={taskPlatforms
          .filter((platform) => platform.id === id)
          .map((platform) => platform.id)}
        fallbackLabel={t("tasks.provider")}
      />
    );
  return (
    <WorkspaceToolbar
      context={
        context ? (
          <span
            title={context}
            className="min-w-0 flex-1 basis-24 truncate text-xs text-faint"
          >
            {context}
          </span>
        ) : undefined
      }
      actions={
        <>
          <button
            type="button"
            className="app-button-ghost h-7 w-7 p-0"
            title={t("settings.refresh")}
            aria-label={t("settings.refresh")}
            disabled={loading}
            onClick={onRefresh}
          >
            <RefreshCw
              size={15}
              className={cn(
                loading && "animate-spin motion-reduce:animate-none",
              )}
            />
          </button>
          <PlatformAccountButton
            provider={provider}
            refreshKey={accountRefresh}
            onClick={onAccounts}
          />
          <button
            type="button"
            className={cn(
              "app-button-ghost h-7 w-7 p-0",
              connections && "bg-surface-active text-primary",
            )}
            title={t("tasks.connections")}
            aria-label={t("tasks.connections")}
            aria-expanded={connections}
            onClick={onConnections}
          >
            <Settings2 size={15} aria-hidden="true" />
          </button>
        </>
      }
    >
      {leading}
      <ThemedSelect
        aria-label={t("tasks.provider")}
        className="h-7 w-36 gap-2 py-0 text-xs"
        value={provider}
        leadingIcon={providerIcon(provider)}
        optionIcon={providerIcon}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "all") onProvider("all");
          else {
            const platform = taskPlatforms.find(
              (platform) => platform.id === value,
            );
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
      {children}
      {repository && onOpenRepository && (
        <button
          type="button"
          className="app-button-ghost h-7 w-7 p-0"
          title={t("tasks.openRemote")}
          aria-label={t("tasks.openRemote")}
          onClick={() => onOpenRepository(repository)}
        >
          <ExternalLink size={15} />
        </button>
      )}
    </WorkspaceToolbar>
  );
}
