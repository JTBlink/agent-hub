import { useId, useRef, useState, type ReactNode } from "react";
import {
  CloudDownload,
  RefreshCw,
  Search,
  Settings,
  Terminal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "../ThemedSelect";
import { cn } from "../../utils";

/** Repository actions are owned by the Git page; display preferences stay local. */
export function GitGraphToolbar({
  branchControl,
  remotes,
  onRemotes,
  query,
  onQuery,
  limit,
  onLimit,
  loading,
  busy,
  fetching,
  onTerminal,
  onFetch,
  onRefresh,
}: {
  branchControl?: ReactNode;
  remotes: boolean;
  onRemotes: (value: boolean) => void;
  query: string;
  onQuery: (value: string) => void;
  limit: number;
  onLimit: (value: number) => void;
  loading: boolean;
  busy: boolean;
  fetching: boolean;
  onTerminal?: () => void;
  onFetch: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const search = useRef<HTMLInputElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [settings, setSettings] = useState(false);
  const settingsId = useId();
  const iconButton = "app-button-ghost h-7 w-7 shrink-0 p-0";
  return (
    <div className="shrink-0 border-b border-border-subtle text-xs">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {branchControl}
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={remotes}
            onChange={(event) => onRemotes(event.target.checked)}
          />
          {t("git.graph.remotes")}
        </label>
        <input
          ref={search}
          type="search"
          className="min-w-32 flex-1 rounded border border-border bg-surface px-2 py-1 text-primary outline-none focus:border-accent"
          aria-label={t("git.filterCommits")}
          placeholder={t("git.filterCommitsHint")}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onQuery("");
            }
          }}
        />
        <div
          role="group"
          aria-label={t("git.graph.tools")}
          className="ml-auto flex shrink-0 items-center gap-1"
        >
          <button
            type="button"
            className={iconButton}
            aria-label={t("git.graph.search")}
            title={t("git.graph.search")}
            onClick={() => {
              search.current?.focus();
              search.current?.select();
            }}
          >
            <Search size={16} />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label={t("git.graph.terminal")}
            title={t("git.graph.terminal")}
            disabled={!onTerminal}
            onClick={onTerminal}
          >
            <Terminal size={16} />
          </button>
          <button
            ref={settingsButton}
            type="button"
            className={cn(
              iconButton,
              settings && "bg-surface-active text-accent-light",
            )}
            aria-label={t("git.graph.settings")}
            title={t("git.graph.settings")}
            aria-expanded={settings}
            aria-controls={settingsId}
            onClick={() => setSettings((value) => !value)}
          >
            <Settings size={16} />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label={t("git.actions.fetch")}
            title={t("git.actions.fetch")}
            disabled={busy || fetching}
            aria-busy={fetching}
            onClick={onFetch}
          >
            <CloudDownload
              size={16}
              className={cn(fetching && "animate-pulse")}
            />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label={t("settings.refresh")}
            title={t("settings.refresh")}
            disabled={busy || loading}
            onClick={onRefresh}
          >
            <RefreshCw size={16} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>
      {settings && (
        <div
          id={settingsId}
          role="region"
          aria-label={t("git.graph.settings")}
          className="flex flex-wrap items-center gap-2 border-t border-border-subtle bg-bg-secondary px-3 py-2"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setSettings(false);
              settingsButton.current?.focus();
            }
          }}
        >
          <label className="flex items-center gap-2">
            {t("git.graph.commitLimit")}
            <ThemedSelect
              aria-label={t("git.graph.commitLimit")}
              value={String(limit)}
              onChange={(event) => onLimit(Number(event.target.value))}
            >
              {[...new Set([200, 500, 1000, 5000, limit])]
                .sort((a, b) => a - b)
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </ThemedSelect>
          </label>
        </div>
      )}
    </div>
  );
}
