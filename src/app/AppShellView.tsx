import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_NAME } from "../lib/app-meta";
import {
  createClaudeInstructionSymlink,
  getAgentRuntimes,
  getAppInfo,
  getClaudeGlobalConfig,
  getCodexGlobalConfig,
  getDiagnostics,
  getOpenCodeGlobalConfig,
  listConfigHistory,
  listWorkspaces,
  previewConfigEdit,
  readConfigSource,
  scanWorkspace,
  writeConfig,
  type ConfigDocument,
  type ConfigEditPreview,
  type ConfigHistoryRecord,
  type InstructionFile,
  type UnifiedDiagnostic,
  type WorkspaceRecord,
} from "../lib/backend";
import { parseConfigSource, serializeConfig } from "../lib/config-schema";
import { useLanguage } from "../lib/i18n";
import { BrandGlyph, Icon } from "./AppIcons";
import { ConfigCenter } from "./ConfigCenter";
import { DiagnosticsPage } from "./DiagnosticsPage";
import { HistoryPage } from "./HistoryPage";
import { Overview } from "./OverviewPage";
import { SettingsPage } from "./SettingsPage";
import { SkillsModulePage } from "./SkillsModulePage";
import { WorkspacesPage } from "./WorkspacesPage";
import {
  agentMeta,
  getWorkspaceDisplayConfigs,
  navigation,
  navigationLabel,
  persistWorkspacePath,
  readPersistedWorkspacePath,
  statusLabel,
  type Section,
} from "./shell-presentation";

export function App() {
  const { t } = useLanguage();
  const [section, setSection] = useState<Section>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [runtimeVersion, setRuntimeVersion] = useState<string>();
  const [configs, setConfigs] = useState<ConfigDocument[]>([]);
  const [installedAgentIds, setInstalledAgentIds] = useState<
    ConfigDocument["agent"][]
  >([]);
  const [workspaceConfigs, setWorkspaceConfigs] = useState<ConfigDocument[]>(
    [],
  );
  const [workspaceInstructions, setWorkspaceInstructions] = useState<
    InstructionFile[]
  >([]);
  const [selectedScope, setSelectedScope] =
    useState<ConfigDocument["scope"]>("global");
  const [history, setHistory] = useState<ConfigHistoryRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<UnifiedDiagnostic[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState(
    readPersistedWorkspacePath,
  );
  const [selectedAgent, setSelectedAgent] =
    useState<ConfigDocument["agent"]>("claude-code");
  useEffect(() => {
    if (!installedAgentIds.includes(selectedAgent) && installedAgentIds[0]) {
      setSelectedAgent(installedAgentIds[0]);
    }
  }, [installedAgentIds, selectedAgent]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [editMode, setEditMode] = useState<"form" | "source">("form");
  const [formState, setFormState] = useState<Record<string, unknown>>({});
  const [source, setSource] = useState("");
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState<ConfigEditPreview>();
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>();

  const loadWorkspaceConfig = useCallback((workspaceDirectory: string) => {
    void scanWorkspace(workspaceDirectory)
      .then((result) => {
        setWorkspaceConfigs(result.configs);
        setWorkspaceInstructions(result.instructions);
      })
      .catch(() => {
        setError("无法读取所选工作空间配置，请重新扫描后重试。");
      });
  }, []);

  const scan = useCallback(() => {
    setLoading(true);
    setError(undefined);
    void Promise.allSettled([
      getAgentRuntimes(),
      getAppInfo(),
      getClaudeGlobalConfig(),
      getCodexGlobalConfig(),
      getOpenCodeGlobalConfig(),
    ]).then((results) => {
      const [runtimeResult, appResult, ...rest] = results;
      const nextInstalledAgents =
        runtimeResult.status === "fulfilled"
          ? runtimeResult.value
              .filter((status) => status.installed)
              .map((status) => status.agent)
          : [];
      setInstalledAgentIds(nextInstalledAgents);
      if (appResult.status === "fulfilled")
        setRuntimeVersion(appResult.value.version);
      const configResults = rest.slice(
        0,
        3,
      ) as PromiseSettledResult<ConfigDocument>[];
      const nextConfigs = configResults.flatMap((result) =>
        result.status === "fulfilled" &&
        nextInstalledAgents.includes(result.value.agent)
          ? [result.value]
          : [],
      );
      setConfigs(nextConfigs);
      if (runtimeResult.status === "rejected")
        setError("无法连接到本地 AgentHub 服务。");
      setLoading(false);
    });
    void getDiagnostics()
      .then(setDiagnostics)
      .catch(() => undefined);
    void listWorkspaces()
      .then((records) => {
        setWorkspaces(records);
        const candidate = selectedWorkspacePath || readPersistedWorkspacePath();
        const next = records.some((item) => item.normalizedPath === candidate)
          ? candidate
          : (records[0]?.normalizedPath ?? "");
        persistWorkspacePath(next);
        setSelectedWorkspacePath(next);
        if (next) loadWorkspaceConfig(next);
        else {
          setWorkspaceConfigs([]);
          setWorkspaceInstructions([]);
        }
      })
      .catch(() => undefined);
    void listConfigHistory()
      .then(setHistory)
      .catch(() => undefined);
  }, [loadWorkspaceConfig, selectedWorkspacePath]);
  useEffect(() => {
    scan();
  }, [scan]);

  const availableConfigs = configs.filter((config) =>
    installedAgentIds.includes(config.agent),
  );
  const availableWorkspaceConfigs = workspaceConfigs.filter((config) =>
    installedAgentIds.includes(config.agent),
  );
  const visibleConfigs =
    selectedScope === "global"
      ? availableConfigs
      : getWorkspaceDisplayConfigs(availableConfigs, availableWorkspaceConfigs);
  const selectedConfig = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    const matches = (config: ConfigDocument) => {
      if (!normalizedQuery) return true;
      return [
        agentMeta[config.agent].name,
        config.path,
        statusLabel(config.status),
        JSON.stringify(config.structuredView),
        selectedWorkspacePath,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    };
    return (
      visibleConfigs.find(
        (candidate) => candidate.agent === selectedAgent && matches(candidate),
      ) ?? (normalizedQuery ? visibleConfigs.find(matches) : undefined)
    );
  }, [visibleConfigs, selectedAgent, searchQuery, selectedWorkspacePath]);
  useEffect(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery || !selectedConfig) return;
    if (selectedConfig.agent !== selectedAgent) {
      setSelectedAgent(selectedConfig.agent);
      setEditing(false);
    }
  }, [searchQuery, selectedConfig, selectedAgent]);
  const readyCount = availableConfigs.filter(
    (config) => config.status === "ready",
  ).length;
  const diagnosticCount = diagnostics.filter(
    (item) =>
      item.severity !== "info" &&
      (item.agent === null || installedAgentIds.includes(item.agent)),
  ).length;
  const visibleDiagnostics = diagnostics.filter(
    (item) => item.agent === null || installedAgentIds.includes(item.agent),
  );

  async function startEditing() {
    if (!selectedConfig || selectedConfig.status !== "ready") return;
    setSaveMessage(undefined);
    try {
      const raw = await readConfigSource(selectedConfig.path);
      setSource(raw);
      setDraft(raw);
      setPreview(undefined);
      try {
        const parsed = parseConfigSource(selectedConfig.format, raw);
        setFormState(parsed);
        setEditMode("form");
      } catch {
        setEditMode("source");
      }
      setEditing(true);
    } catch {
      setSaveMessage("原文读取失败。请重新扫描后再试。");
    }
  }
  async function showPreview() {
    if (!selectedConfig) return;
    try {
      setPreview(
        await previewConfigEdit(
          selectedConfig.path,
          selectedConfig.format,
          draft,
        ),
      );
      setSaveMessage(undefined);
    } catch {
      setSaveMessage("无法生成 Diff。请检查格式错误后重试。");
    }
  }
  async function saveChanges() {
    if (!selectedConfig || !preview || saving) return;
    setSaving(true);
    try {
      await writeConfig(
        selectedConfig.path,
        selectedConfig.format,
        selectedConfig.checksum ?? preview.before.checksum,
        draft,
      );
      setSaveMessage("已保存，并创建了可回滚备份。");
      setEditing(false);
      scan();
    } catch {
      setSaveMessage(
        "保存失败：文件可能已被外部修改。重新扫描后确认最新内容。",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label={t("mainNavigation")}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <BrandGlyph />
          </div>
          <div>
            <strong>{APP_NAME}</strong>
            <span>{t("localWorkspace")}</span>
          </div>
        </div>
        <div
          className="workspace-switcher"
          role="status"
          aria-label="当前工作空间：个人工作区"
        >
          <span className="workspace-dot" />
          <span>
            <strong>{t("personalWorkspace")}</strong>
            <small>{t("globalConfigContext")}</small>
          </span>
        </div>
        <nav className="main-nav">
          <p className="nav-label">{t("workbench")}</p>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${section === item.id ? "active" : ""}`}
              onClick={() => setSection(item.id)}
              aria-current={section === item.id ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{navigationLabel(item.id, t)}</span>
            </button>
          ))}
          <p className="nav-label nav-label-lower">{t("systemLabel")}</p>
          <button
            className={`nav-item ${section === "settings" ? "active" : ""}`}
            onClick={() => setSection("settings")}
            aria-current={section === "settings" ? "page" : undefined}
          >
            <Icon name="settings" />
            <span>{t("settings")}</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="privacy-badge">
            <Icon name="shield" size={16} />
            <span>
              <strong>本地优先</strong>
              <small>数据只保存在此设备</small>
            </span>
          </div>
          <span className="version">v{runtimeVersion ?? __APP_VERSION__}</span>
        </div>
      </aside>
      <main
        className="main-content"
        id="main-content"
        tabIndex={-1}
        aria-busy={loading}
      >
        <header className="topbar">
          <div className="breadcrumb">
            <span>AgentHub</span>
            <Icon name="arrow" size={14} />
            <strong>{navigationLabel(section, t)}</strong>
          </div>
          <div className="topbar-actions">
            <label className="search-field">
              <Icon name="search" size={16} />
              <span className="sr-only">{t("searchAria")}</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchAria")}
              />
              {searchQuery && (
                <button
                  className="search-clear"
                  type="button"
                  aria-label={t("clearSearch")}
                  onClick={() => setSearchQuery("")}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </label>
            <button
              className="button button-ghost"
              onClick={scan}
              disabled={loading}
              aria-label={loading ? t("scanning") : t("rescan")}
            >
              <Icon name="refresh" size={16} />
              <span>{loading ? t("scanning") : t("rescan")}</span>
            </button>
          </div>
        </header>
        {loading && (
          <div className="loading-banner" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            {t("loadingScan")}
          </div>
        )}
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="warning" />
            <span>{error}</span>
            <button onClick={scan}>{t("retry")}</button>
          </div>
        )}
        {section === "overview" && (
          <Overview
            readyCount={readyCount}
            diagnosticCount={diagnosticCount}
            configs={availableConfigs}
            onNavigate={setSection}
          />
        )}
        {section === "configs" && (
          <ConfigCenter
            configs={availableConfigs}
            workspaceConfigs={availableWorkspaceConfigs}
            workspaceInstructions={workspaceInstructions}
            workspacePath={selectedWorkspacePath}
            onCreateInstructionLink={async () => {
              const result = await createClaudeInstructionSymlink(
                selectedWorkspacePath,
              );
              loadWorkspaceConfig(selectedWorkspacePath);
              return result;
            }}
            selectedScope={selectedScope}
            setSelectedScope={(scope) => {
              setSelectedScope(scope);
              setEditing(false);
            }}
            selectedAgent={selectedAgent}
            setSelectedAgent={setSelectedAgent}
            selectedConfig={selectedConfig}
            editing={editing}
            editMode={editMode}
            setEditMode={(mode) => {
              if (mode === "source" && editMode === "form") {
                try {
                  const serialized = serializeConfig(
                    selectedConfig?.format ?? "json",
                    formState,
                  );
                  setDraft(serialized);
                } catch {
                  /* keep existing draft */
                }
              } else if (mode === "form" && editMode === "source") {
                try {
                  const parsed = parseConfigSource(
                    selectedConfig?.format ?? "json",
                    draft,
                  );
                  setFormState(parsed);
                } catch {
                  setSaveMessage("源码存在格式错误，无法切换到表单模式。");
                  return;
                }
              }
              setEditMode(mode);
            }}
            formState={formState}
            setFormState={(next) => {
              setFormState(next);
              try {
                setDraft(
                  serializeConfig(selectedConfig?.format ?? "json", next),
                );
              } catch {
                /* serialization failure; draft stays stale */
              }
            }}
            source={source}
            draft={draft}
            setDraft={setDraft}
            preview={preview}
            saveMessage={saveMessage}
            onEdit={startEditing}
            onCancel={() => {
              setEditing(false);
              setPreview(undefined);
              setSaveMessage(undefined);
            }}
            onPreview={showPreview}
            onSave={saveChanges}
            saving={saving}
            searchQuery={searchQuery}
          />
        )}
        {section === "skills" && <SkillsModulePage />}
        {section === "workspaces" && (
          <WorkspacesPage
            workspaces={workspaces}
            selectedWorkspacePath={selectedWorkspacePath}
            onSelectWorkspace={(workspaceDirectory) => {
              setSelectedWorkspacePath(workspaceDirectory);
              persistWorkspacePath(workspaceDirectory);
            }}
            onChanged={scan}
            searchQuery={searchQuery}
            onScanned={(result, navigateToConfigs = true) => {
              setSelectedWorkspacePath(result.workspace.normalizedPath);
              persistWorkspacePath(result.workspace.normalizedPath);
              setWorkspaceConfigs(result.configs);
              setWorkspaceInstructions(result.instructions);
              setSelectedScope("workspace");
              if (navigateToConfigs) {
                setSection("configs");
              }
            }}
          />
        )}
        {section === "diagnostics" && (
          <DiagnosticsPage
            diagnostics={visibleDiagnostics}
            onNavigate={setSection}
            onRepair={scan}
            searchQuery={searchQuery}
          />
        )}
        {section === "history" && (
          <HistoryPage
            history={history}
            onNavigate={setSection}
            onChanged={scan}
            searchQuery={searchQuery}
          />
        )}
        {section === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
