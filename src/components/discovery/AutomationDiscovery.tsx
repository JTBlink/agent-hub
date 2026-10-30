import { useEffect, useRef, useState } from "react";
import { FolderUp, GitBranch, Loader2, Search } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import {
  getAutomationTemplates,
  previewAutomationPackage,
  previewGitAutomationPackages,
  type AutomationCatalog,
  type GitAutomationCatalog,
} from "../../lib/tauri";
import type { AutomationInstallSource } from "../../lib/automationDiscovery";
import { getErrorMessage } from "../../lib/error";
import { AutomationPackageCard } from "./AutomationPackageCard";
import { AutomationInstaller } from "./AutomationInstaller";
import { StatusBanner } from "../StatusBanner";
import { useAutomationOverview } from "../../hooks/useAutomationOverview";

export function AutomationDiscovery({
  source,
  active,
}: {
  source: "recommended" | "local" | "git";
  active: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const overview = useAutomationOverview(locale);
  const refreshOverview = overview.refresh;
  const [installedIds, setInstalledIds] = useState<Record<string, string>>({});
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) refreshOverview();
    wasActive.current = active;
  }, [active, refreshOverview]);
  const [catalog, setCatalog] = useState<AutomationCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [reference, setReference] = useState("");
  const [git, setGit] = useState<{
    url: string;
    catalog: GitAutomationCatalog;
  } | null>(null);
  const [selected, setSelected] = useState<AutomationInstallSource | null>(
    null,
  );
  const scopeKey = `${active}:${source}`;
  const [busyScope, setBusyScope] = useState<string | null>(null);
  const busy = busyScope === scopeKey;
  const [failure, setFailure] = useState<{
    scope: string;
    message: string;
  } | null>(null);
  const error = failure?.scope === scopeKey ? failure.message : null;
  const operation = useRef(0);
  const mounted = useRef(true);
  const scope = useRef("");
  scope.current = scopeKey;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current += 1;
    };
  }, []);
  useEffect(() => {
    if (!active || source !== "recommended") return;
    let current = true;
    setCatalogLoading(true);
    setCatalogError(null);
    void getAutomationTemplates(locale)
      .then(
        (value) => {
          if (current) setCatalog(value);
        },
        (cause) => {
          if (current)
            setCatalogError(getErrorMessage(cause, t("automation.loadFailed")));
        },
      )
      .finally(() => {
        if (current) setCatalogLoading(false);
      });
    return () => {
      current = false;
    };
  }, [active, source, locale, attempt, t]);
  const preview = async (directory?: boolean) => {
    if (busy) return;
    const generation = ++operation.current;
    const selectedScope = scope.current;
    const current = () =>
      mounted.current &&
      operation.current === generation &&
      scope.current === selectedScope;
    setBusyScope(selectedScope);
    setFailure(null);
    try {
      if (source === "git") {
        setGit(null);
        const catalog = await previewGitAutomationPackages(
          url.trim(),
          reference.trim() || null,
        );
        if (current()) setGit({ url: url.trim(), catalog });
      } else {
        const path = await open({
          directory,
          multiple: false,
          filters: directory
            ? undefined
            : [{ name: "JSON", extensions: ["json"] }],
        });
        if (!current() || typeof path !== "string") return;
        const taskPackage = await previewAutomationPackage(path);
        if (current())
          setSelected({
            title: taskPackage.draft.name,
            description: t("discovery.localDescription"),
            source: t("install.localInstall"),
            draft: taskPackage.draft,
            package: taskPackage,
          });
      }
    } catch (cause) {
      if (current())
        setFailure({
          scope: selectedScope,
          message: getErrorMessage(cause, t("automation.loadFailed")),
        });
    } finally {
      if (mounted.current && generation === operation.current)
        setBusyScope(null);
    }
  };
  const templates: AutomationInstallSource[] = (catalog?.templates ?? []).map(
    (template) => ({
      title: template.title,
      description: template.description,
      source: t("discovery.builtin"),
      draft: template.draft,
      requiresAdmin: template.id === "network-reset",
    }),
  );
  const cards =
    source === "recommended"
      ? templates.filter((task) =>
          `${task.title} ${task.description}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        )
      : (git?.catalog.packages ?? []).map((entry) => ({
          title: entry.package.draft.name,
          description: entry.path,
          source: `${git?.url} · ${git?.catalog.revision.slice(0, 12)}`,
          draft: entry.package.draft,
          package: entry.package,
        }));
  return (
    <div className="space-y-4 pb-8">
      <p className="text-[13px] text-muted">{t("discovery.taskDescription")}</p>
      {overview.error && (
        <StatusBanner
          compact
          tone="danger"
          title={t("automation.loadFailed")}
          description={overview.error}
          actionLabel={t("common.retry")}
          onAction={overview.refresh}
        />
      )}
      {source === "recommended" && (
        <>
          <label className="relative block max-w-xl">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            />
            <input
              aria-label={t("discovery.searchTasks")}
              placeholder={t("discovery.searchTasks")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="app-input w-full pl-9"
            />
          </label>
          {catalogError && (
            <StatusBanner
              compact
              tone="danger"
              title={t("common.requestFailed")}
              description={catalogError}
              actionLabel={t("common.retry")}
              onAction={() => setAttempt((value) => value + 1)}
            />
          )}
          {catalogLoading && (
            <p
              role="status"
              className="flex items-center gap-2 py-4 text-[13px] text-muted"
            >
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </p>
          )}
        </>
      )}
      {source === "local" && (
        <section className="app-panel space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-secondary">
            <FolderUp aria-hidden="true" className="h-4 w-4" />
            {t("automation.importPackage")}
          </h2>
          <p className="text-[12px] leading-6 text-muted">
            {t("discovery.localDescription")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="app-button-primary"
              disabled={busy}
              onClick={() => void preview(true)}
            >
              {t("automation.importFolder")}
            </button>
            <button
              type="button"
              className="app-button-secondary"
              disabled={busy}
              onClick={() => void preview(false)}
            >
              {t("automation.importFile")}
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-background p-3 text-[12px] text-secondary">
            {
              "example-task/\n├── task.json\n├── README.md\n├── prompt.md / herdr.json\n└── scripts/"
            }
          </pre>
        </section>
      )}
      {source === "git" && (
        <form
          className="app-panel space-y-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void preview();
          }}
        >
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-secondary">
            <GitBranch aria-hidden="true" className="h-4 w-4" />
            {t("install.gitInstall")}
          </h2>
          <p className="text-[12px] leading-6 text-muted">
            {t("discovery.gitDescription")}
          </p>
          <label className="block space-y-1.5">
            <span className="text-[12px] text-muted">
              {t("discovery.repository")}
            </span>
            <input
              required
              disabled={busy}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.invalid/team/automations.git"
              className="app-input w-full"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[12px] text-muted">
              {t("discovery.reference")}
            </span>
            <input
              disabled={busy}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="app-input w-full"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="app-button-primary"
          >
            {t("discovery.previewRepository")}
          </button>
        </form>
      )}
      {busy && (
        <p
          role="status"
          className="flex items-center gap-2 text-[13px] text-muted"
        >
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          {t("common.loading")}
        </p>
      )}
      {error && (
        <p role="alert" className="break-words text-[13px] text-danger">
          {error}
        </p>
      )}
      {source === "git" && git && (
        <div className="space-y-2 text-[12px] text-muted">
          <p className="break-all">
            {t("discovery.fixedRevision")}: {git.catalog.revision}
          </p>
          {git.catalog.issues.map((issue) => (
            <p
              role="alert"
              key={issue.path}
              className="break-words text-amber-700 dark:text-amber-400"
            >
              {issue.path}: {issue.message}
            </p>
          ))}
        </div>
      )}
      {source !== "local" && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((task, index) => (
            <AutomationPackageCard
              key={`${task.title}-${index}`}
              task={task}
              installed={
                !!overview.data?.tasks.some(
                  (existing) =>
                    existing.origin === "agent_hub" &&
                    (existing.name.trim() === task.draft.name.trim() ||
                      existing.id ===
                        installedIds[`${task.source}:${task.title}`]) &&
                    (existing.installation === "installed" ||
                      (!existing.installation && existing.can_run)),
                )
              }
              onInstall={() => setSelected(task)}
            />
          ))}
        </div>
      )}
      {source === "recommended" &&
        !catalogLoading &&
        !catalogError &&
        !cards.length && (
          <p className="text-[13px] text-muted">
            {t(query ? "automation.noMatches" : "automation.noTemplates")}
          </p>
        )}
      {source === "git" && git && !cards.length && (
        <p className="text-[13px] text-muted">{t("discovery.noPackages")}</p>
      )}
      <p className="text-[12px] leading-6 text-muted">
        {t("discovery.pausedInstall")}
      </p>
      {selected && (
        <AutomationInstaller
          task={selected}
          onInstalled={(id) => {
            setInstalledIds((previous) => ({
              ...previous,
              [`${selected.source}:${selected.title}`]: id,
            }));
            overview.refresh();
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
