import { useEffect, useId, useMemo, useState } from "react";

import {
  addWorkspace,
  applySkillInstall,
  browseSkillSource,
  executeDiagnosticRecovery,
  getAppInfo,
  getClaudeGlobalConfig,
  getCodexGlobalConfig,
  getDiagnostics,
  getOpenCodeGlobalConfig,
  getSkillInventory,
  listConfigHistory,
  listWorkspaces,
  planSkillInstall,
  previewConfigEdit,
  previewConfigRestore,
  previewDiagnosticRecovery,
  readConfigSource,
  removeWorkspace,
  scanWorkspace,
  restoreConfigHistory,
  writeConfig,
  type ConfigDocument,
  type ConfigEditPreview,
  type ConfigHistoryRecord,
  type DiagnosticRecoveryPreview,
  type InstalledSkill,
  type SkillInstallPlanPreview,
  type SkillInventory,
  type SkillSourceBrowseResult,
  type SkillSourceRequest,
  type UnifiedDiagnostic,
  type WorkspaceRecord,
  type WorkspaceScanResult,
} from "../lib/backend";
import { APP_NAME } from "../lib/app-meta";
import {
  AGENT_SCHEMAS,
  parseConfigSource,
  serializeConfig,
  splitKnownUnknown,
  type AgentFormSchema,
  type FieldDefinition,
} from "../lib/config-schema";
import {
  diagnosticProblem,
  diagnosticSubject,
  matchingSkillsForDiagnostic,
} from "../lib/diagnostic-presentation";
import { createTopologyLayout } from "../lib/topology";
import {
  buildSkillSourceRequest,
  type SkillSourceMode,
} from "../lib/skill-source-flow";
import {
  selectMarketplaceManifest,
  selectSkillSourceDirectory,
  selectWorkspaceDirectory,
} from "../lib/workspace-dialog";

type Section =
  | "overview"
  | "configs"
  | "skills"
  | "workspaces"
  | "diagnostics"
  | "history"
  | "settings";
type IconName =
  | "grid"
  | "sliders"
  | "spark"
  | "folder"
  | "history"
  | "settings"
  | "refresh"
  | "arrow"
  | "shield"
  | "check"
  | "warning"
  | "file"
  | "edit"
  | "external"
  | "search"
  | "plus"
  | "close";

const navigation: { id: Section; label: string; icon: IconName }[] = [
  { id: "overview", label: "总览", icon: "grid" },
  { id: "configs", label: "配置中心", icon: "sliders" },
  { id: "skills", label: "Skills", icon: "spark" },
  { id: "workspaces", label: "工作空间", icon: "folder" },
  { id: "diagnostics", label: "诊断中心", icon: "warning" },
  { id: "history", label: "变更历史", icon: "history" },
];

const agentMeta: Record<string, { name: string; tone: string; mark: string }> =
  {
    "claude-code": { name: "Claude Code", tone: "violet", mark: "C" },
    codex: { name: "Codex", tone: "teal", mark: "X" },
    opencode: { name: "OpenCode", tone: "amber", mark: "O" },
  };

const defaultAgentIds = Object.keys(agentMeta);

function getAgentMeta(agent: string) {
  return (
    agentMeta[agent] ?? {
      name: agent,
      tone: "neutral",
      mark: agent.slice(0, 1).toUpperCase() || "A",
    }
  );
}

function skillSourceLabel(kind: InstalledSkill["source"]["kind"]) {
  if (kind === "skills-sh") return "skills.sh";
  if (kind === "preset-git") return "预置 Git";
  if (kind === "git") return "Git";
  if (kind === "marketplace") return "Marketplace";
  return "本地目录";
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 6h10M18 6h2" />
        <circle cx="16" cy="6" r="2" />
        <path d="M4 12h3M11 12h9" />
        <circle cx="9" cy="12" r="2" />
        <path d="M4 18h10M18 18h2" />
        <circle cx="16" cy="18" r="2" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3L12 3Z" />
        <path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" />
      </>
    ),
    folder: (
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-10Z" />
    ),
    history: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7" />
        <path d="M4 5v5h5" />
        <path d="M12 8v4l2.7 1.7" />
      </>
    ),
    settings: (
      <>
        <path d="M12 3v2M12 19v2M5.6 5.6 7 7M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 11a8 8 0 0 0-14.9-3L3 11" />
        <path d="M3 5v6h6M4 13a8 8 0 0 0 14.9 3L21 13" />
        <path d="M21 19v-6h-6" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 20 6v5c0 5-3.4 8.1-8 10-4.6-1.9-8-5-8-10V6l8-3Z" />
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      </>
    ),
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
    warning: (
      <>
        <path d="M12 4 21 20H3L12 4Z" />
        <path d="M12 10v4M12 17h.01" />
      </>
    ),
    file: (
      <>
        <path d="M6 3h8l4 4v14H6zM14 3v5h5" />
        <path d="M9 13h6M9 17h6" />
      </>
    ),
    edit: (
      <>
        <path d="m4 16-.8 4.8L8 20l11.5-11.5a2.1 2.1 0 0 0-3-3L4 16Z" />
        <path d="m14.5 7.5 3 3" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6M20 4 11 13M18 13v6H4V5h6" />
      </>
    ),
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 5 5" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
  };
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function BrandGlyph({ size = 28 }: { size?: number }) {
  const gradientId = useId();

  return (
    <svg
      className="brand-glyph"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="10" y1="8" x2="55" y2="57">
          <stop offset="0" stopColor="#168bff" />
          <stop offset="0.52" stopColor="#4f8dff" />
          <stop offset="1" stopColor="#42d9b1" />
        </linearGradient>
      </defs>
      <path className="brand-glyph-rail" d="M32 12v14M15 48l12-9M49 48l-12-9" />
      <path
        className="brand-glyph-flow"
        d="M32 10v16M13 49l14-10M51 49 37 39"
        stroke={`url(#${gradientId})`}
      />
      <circle className="brand-glyph-node top" cx="32" cy="9" r="6" />
      <circle className="brand-glyph-node left" cx="12" cy="50" r="6" />
      <circle className="brand-glyph-node right" cx="52" cy="50" r="6" />
      <circle className="brand-glyph-hub-ring" cx="32" cy="34" r="11" />
      <circle className="brand-glyph-hub" cx="32" cy="34" r="6" />
      <circle className="brand-glyph-core" cx="32" cy="34" r="2.3" />
    </svg>
  );
}

function statusLabel(status: ConfigDocument["status"] | undefined) {
  if (status === "ready") return "已同步";
  if (status === "missing") return "未找到";
  if (status === "invalid") return "需要修复";
  if (status === "unreadable") return "无法读取";
  return "扫描中";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" && error.trim() ? error : fallback;
}

export function App() {
  const [section, setSection] = useState<Section>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [runtimeVersion, setRuntimeVersion] = useState<string>();
  const [configs, setConfigs] = useState<ConfigDocument[]>([]);
  const [workspaceConfigs, setWorkspaceConfigs] = useState<ConfigDocument[]>(
    [],
  );
  const [selectedScope, setSelectedScope] =
    useState<ConfigDocument["scope"]>("global");
  const [skills, setSkills] = useState<SkillInventory>();
  const [history, setHistory] = useState<ConfigHistoryRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<UnifiedDiagnostic[]>([]);
  const [skillDiagnosticFocus, setSkillDiagnosticFocus] =
    useState<UnifiedDiagnostic>();
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [selectedAgent, setSelectedAgent] =
    useState<ConfigDocument["agent"]>("claude-code");
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

  const scan = () => {
    setLoading(true);
    setError(undefined);
    void Promise.allSettled([
      getAppInfo(),
      getClaudeGlobalConfig(),
      getCodexGlobalConfig(),
      getOpenCodeGlobalConfig(),
      getSkillInventory(),
    ]).then((results) => {
      const [appResult, ...rest] = results;
      if (appResult.status === "fulfilled")
        setRuntimeVersion(appResult.value.version);
      const configResults = rest.slice(
        0,
        3,
      ) as PromiseSettledResult<ConfigDocument>[];
      const nextConfigs = configResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (nextConfigs.length) setConfigs(nextConfigs);
      const skillsResult = rest[3] as PromiseSettledResult<SkillInventory>;
      if (skillsResult?.status === "fulfilled") setSkills(skillsResult.value);
      if (!nextConfigs.length && skillsResult?.status === "rejected")
        setError("无法连接到本地 AgentHub 服务。请点击“重新扫描”重试。");
      setLoading(false);
    });
    void getDiagnostics()
      .then(setDiagnostics)
      .catch(() => undefined);
    void listWorkspaces()
      .then(setWorkspaces)
      .catch(() => undefined);
    void listConfigHistory()
      .then(setHistory)
      .catch(() => undefined);
  };
  const refreshSkillInventory = (workspaceDirectory?: string) => {
    void getSkillInventory(workspaceDirectory)
      .then(setSkills)
      .catch(() => setError("Skill 安装成功，但清单刷新失败，请重新扫描。"));
  };
  useEffect(() => {
    scan();
  }, []);

  const visibleConfigs =
    selectedScope === "global" ? configs : workspaceConfigs;
  const selectedConfig = useMemo(() => {
    const config = visibleConfigs.find(
      (candidate) => candidate.agent === selectedAgent,
    );
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!config || !normalizedQuery) return config;
    const haystack = [
      agentMeta[config.agent].name,
      config.path,
      statusLabel(config.status),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return haystack.includes(normalizedQuery) ? config : undefined;
  }, [visibleConfigs, selectedAgent, searchQuery]);
  const readyCount = configs.filter(
    (config) => config.status === "ready",
  ).length;
  const diagnosticCount = diagnostics.filter(
    (item) => item.severity !== "info",
  ).length;

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
      <aside className="sidebar" aria-label="主导航">
        <div className="brand-lockup">
          <div className="brand-mark">
            <BrandGlyph />
          </div>
          <div>
            <strong>{APP_NAME}</strong>
            <span>本地 Agent 工作空间</span>
          </div>
        </div>
        <div
          className="workspace-switcher"
          role="status"
          aria-label="当前工作空间：个人工作区"
        >
          <span className="workspace-dot" />
          <span>
            <strong>个人工作区</strong>
            <small>全局配置上下文</small>
          </span>
        </div>
        <nav className="main-nav">
          <p className="nav-label">工作台</p>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${section === item.id ? "active" : ""}`}
              onClick={() => setSection(item.id)}
              aria-current={section === item.id ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "skills" && skills && (
                <em>{skills.skills.length}</em>
              )}
            </button>
          ))}
          <p className="nav-label nav-label-lower">系统</p>
          <button
            className={`nav-item ${section === "settings" ? "active" : ""}`}
            onClick={() => setSection("settings")}
            aria-current={section === "settings" ? "page" : undefined}
          >
            <Icon name="settings" />
            <span>设置</span>
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
          <span className="version">v{runtimeVersion ?? "0.1.0"}</span>
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
            <strong>
              {navigation.find((item) => item.id === section)?.label ?? "设置"}
            </strong>
          </div>
          <div className="topbar-actions">
            <label className="search-field">
              <Icon name="search" size={16} />
              <span className="sr-only">搜索配置、Skill 和工作空间</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索配置、Skill…"
                aria-label="搜索配置、Skill 和工作空间"
              />
              {searchQuery && (
                <button
                  className="search-clear"
                  type="button"
                  aria-label="清除搜索"
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
              aria-label={loading ? "扫描中" : "重新扫描"}
            >
              <Icon name="refresh" size={16} />
              <span>{loading ? "扫描中" : "重新扫描"}</span>
            </button>
          </div>
        </header>
        {loading && (
          <div className="loading-banner" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            正在扫描本机 Agent 配置与 Skills…
          </div>
        )}
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="warning" />
            <span>{error}</span>
            <button onClick={scan}>重试</button>
          </div>
        )}
        {section === "overview" && (
          <Overview
            readyCount={readyCount}
            skillCount={skills?.skills.length ?? 0}
            diagnosticCount={diagnosticCount}
            configs={configs}
            onNavigate={setSection}
          />
        )}
        {section === "configs" && (
          <ConfigCenter
            configs={configs}
            workspaceConfigs={workspaceConfigs}
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
        {section === "skills" && (
          <SkillsCenter
            skills={skills}
            searchQuery={searchQuery}
            onScan={scan}
            onNavigate={setSection}
            workspaces={workspaces}
            onInstalled={refreshSkillInventory}
            diagnosticFocus={skillDiagnosticFocus}
            onDismissDiagnostic={() => setSkillDiagnosticFocus(undefined)}
          />
        )}
        {section === "workspaces" && (
          <WorkspacesPage
            workspaces={workspaces}
            onChanged={scan}
            searchQuery={searchQuery}
            onScanned={(result) => {
              setWorkspaceConfigs(result.configs);
              setSelectedScope("workspace");
              setSection("configs");
            }}
          />
        )}
        {section === "diagnostics" && (
          <DiagnosticsPage
            diagnostics={diagnostics}
            onNavigate={setSection}
            onViewSkillDetails={(item) => {
              setSkillDiagnosticFocus(item);
              setSearchQuery("");
              setSection("skills");
            }}
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

function Overview({
  readyCount,
  skillCount,
  diagnosticCount,
  configs,
  onNavigate,
}: {
  readyCount: number;
  skillCount: number;
  diagnosticCount: number;
  configs: ConfigDocument[];
  onNavigate: (section: Section) => void;
}) {
  const topologyAgentIds = Array.from(
    new Set([...defaultAgentIds, ...configs.map((config) => config.agent)]),
  );
  const topologyLayout = createTopologyLayout(topologyAgentIds.length);
  const connectionState = (agent: string) => {
    const status = configs.find((config) => config.agent === agent)?.status;
    if (status === "ready") return "ready";
    if (status === "invalid" || status === "unreadable") return "warning";
    return "idle";
  };
  const totalAgents = topologyAgentIds.length;
  const connected = totalAgents > 0 && readyCount === totalAgents;
  const hasAttention = diagnosticCount > 0 || readyCount < totalAgents;
  const healthLabel = connected && !diagnosticCount ? "运行良好" : "需要关注";
  const healthTone = connected && !diagnosticCount ? "healthy" : "attention";
  return (
    <div className="page overview-page">
      <section className="overview-hero" aria-labelledby="overview-title">
        <div className="overview-hero-copy">
          <div className="overview-kicker">
            <div
              className={`health-badge ${healthTone}`}
              aria-label={`本机工作区：${healthLabel}`}
            >
              <i aria-hidden="true" />
              <span>{healthLabel}</span>
              <small>本机工作区</small>
            </div>
            <p className="eyebrow">工作台 / 总览</p>
          </div>
          <h1 id="overview-title">掌控每个 Agent 的运行状态。</h1>
          <p className="overview-hero-description">
            <span>这里汇总配置、Skills 与诊断状态。</span>
            <span>先看全局，再决定下一次安全写入。</span>
          </p>
          <div className="overview-hero-actions">
            <button
              className={`button button-primary ${hasAttention ? "attention-action" : ""}`}
              onClick={() =>
                onNavigate(hasAttention ? "diagnostics" : "configs")
              }
            >
              <Icon name={hasAttention ? "warning" : "edit"} size={16} />
              {hasAttention ? "处理待关注项" : "管理配置"}
              <Icon name="arrow" size={15} />
            </button>
            <span className="local-badge">
              <Icon name="shield" size={14} />
              数据仅在本机
            </span>
          </div>
        </div>
        <div
          className="overview-snapshot"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`本机状态：${readyCount}/${totalAgents} 个 Agent 已连接，${skillCount} 个 Skills 已发现，${diagnosticCount} 项待处理诊断`}
        >
          <div className="snapshot-heading">
            <span>本地状态</span>
            <span className="snapshot-live">
              <i />
              当前结果
            </span>
          </div>
          <div className="snapshot-score">
            <strong>{readyCount}</strong>
            <span>/ {totalAgents} Agent 已连接</span>
          </div>
          <div className="snapshot-meter" aria-hidden="true">
            <i
              style={{
                width: `${totalAgents ? Math.round((readyCount / totalAgents) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="snapshot-footnote">
            <span>{skillCount} 个 Skills 已发现</span>
            <span className={diagnosticCount ? "has-attention" : ""}>
              {diagnosticCount ? `${diagnosticCount} 项待处理` : "无待处理诊断"}
            </span>
          </div>
        </div>
      </section>

      <section className="topology-card" aria-labelledby="topology-title">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">连接状态</p>
            <h2 id="topology-title">Agent 连接拓扑</h2>
            <p className="topology-subtitle">
              蓝色轨道表示配置流，节点亮起代表当前扫描已同步。
            </p>
          </div>
          <div className="topology-meta">
            <span className="topology-legend">
              <i className="legend-flow" />
              同步中
            </span>
            <span className="topology-legend">
              <i className="legend-idle" />
              未接入
            </span>
            <span className="live-indicator">
              <i />
              本地扫描
            </span>
          </div>
        </div>
        <div
          className="topology"
          style={
            {
              "--topology-height": `${topologyLayout.height}px`,
            } as React.CSSProperties
          }
        >
          <svg
            className="topology-network"
            viewBox={`0 0 100 ${topologyLayout.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="topology-teal" x1="0" x2="1">
                <stop stopColor="#7D8CFF" />
                <stop offset="1" stopColor="#2C9CFF" />
              </linearGradient>
              <linearGradient id="topology-violet" x1="0" x2="1">
                <stop stopColor="#168BFF" />
                <stop offset="1" stopColor="#7185FF" />
              </linearGradient>
              <linearGradient id="topology-amber" x1="0" x2="1">
                <stop stopColor="#42D9B1" />
                <stop offset="1" stopColor="#2C9CFF" />
              </linearGradient>
            </defs>
            {topologyAgentIds.map((agent, index) => {
              const connection = topologyLayout.connections[index];
              return (
                <g key={agent}>
                  <path className="network-rail" d={connection.path} />
                  <path
                    className={`network-flow ${index < 3 ? `flow-${["top", "mid", "bottom"][index]}` : "flow-dynamic"} ${connectionState(agent)}`}
                    d={connection.path}
                  />
                  <ellipse
                    className={`network-pulse ${index < 3 ? `pulse-${["top", "mid", "bottom"][index]}` : "pulse-dynamic"} ${connectionState(agent)}`}
                    cx={connection.pulseX}
                    cy={connection.pulseY}
                    rx="0.55"
                    ry="5"
                  />
                </g>
              );
            })}
          </svg>
          <div
            className="agent-nodes"
            style={
              {
                "--agent-stack-height": `${Math.max(0, topologyLayout.height - 20)}px`,
                "--agent-gap": `${topologyLayout.gap}px`,
                "--agent-node-height": `${topologyLayout.nodeHeight}px`,
              } as React.CSSProperties
            }
          >
            {topologyAgentIds.map((agent) => {
              const config = configs.find((item) => item.agent === agent);
              const meta = getAgentMeta(agent);
              const state = connectionState(agent);
              return (
                <div
                  className={`agent-node ${state === "ready" ? "connected" : state === "warning" ? "attention" : "scanning"}`}
                  key={agent}
                >
                  <div className={`agent-avatar ${meta.tone}`}>{meta.mark}</div>
                  <div>
                    <strong>{meta.name}</strong>
                    <span
                      className={`status-text ${state === "ready" ? "success" : state === "warning" ? "attention" : "muted"}`}
                    >
                      <i />
                      {statusLabel(config?.status)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hub-node">
            <div className="hub-orbit">
              <BrandGlyph size={46} />
            </div>
            <strong>AgentHub</strong>
            <small>本地统一中枢</small>
          </div>
        </div>
        <div className="topology-footer">
          <span>
            <i className="footer-signal" />
            {readyCount}/{totalAgents} 个 Agent 正在为本地工作区提供配置
          </span>
          <button className="text-button" onClick={() => onNavigate("configs")}>
            查看配置状态 <Icon name="arrow" size={15} />
          </button>
        </div>
      </section>
      <section className="overview-health-grid" aria-label="工作区健康指标">
        <article className="health-panel health-panel-primary">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">工作区健康</p>
              <h2>现在可以安全工作吗？</h2>
            </div>
            <span className={`health-score ${healthTone}`}>
              {readyCount}/{totalAgents}
            </span>
          </div>
          <p className="health-panel-copy">
            {connected && !diagnosticCount
              ? `${totalAgents} 个 Agent 都已读取到有效配置，写入仍会经过 Diff 与备份。`
              : "有配置或诊断需要确认，建议先处理后再进行批量写入。"}
          </p>
          <div className="health-list">
            <button onClick={() => onNavigate("configs")}>
              <span className="health-list-icon teal">
                <Icon name="sliders" />
              </span>
              <span>
                <strong>配置同步</strong>
                <small>
                  {readyCount}/{totalAgents} 个 Agent 已准备好
                </small>
              </span>
              <Icon name="arrow" size={15} />
            </button>
            <button onClick={() => onNavigate("skills")}>
              <span className="health-list-icon violet">
                <Icon name="spark" />
              </span>
              <span>
                <strong>Skills 目录</strong>
                <small>{skillCount} 个能力可供管理</small>
              </span>
              <Icon name="arrow" size={15} />
            </button>
            <button onClick={() => onNavigate("diagnostics")}>
              <span
                className={`health-list-icon ${diagnosticCount ? "amber" : "teal"}`}
              >
                <Icon name={diagnosticCount ? "warning" : "check"} />
              </span>
              <span>
                <strong>诊断队列</strong>
                <small>
                  {diagnosticCount
                    ? `${diagnosticCount} 项需要处理`
                    : "当前没有异常"}
                </small>
              </span>
              <Icon name="arrow" size={15} />
            </button>
          </div>
        </article>
        <article className="next-panel">
          <div>
            <p className="eyebrow">安全写入</p>
            <h2>每次修改都可回退</h2>
            <p>扫描、Diff、确认、备份，四步完成一次可追溯的配置变更。</p>
          </div>
          <div className="write-flow" aria-label="安全写入流程">
            <span className="write-flow-step done">
              <i>1</i>
              <b>扫描</b>
            </span>
            <span className="write-flow-line" />
            <span className="write-flow-step done">
              <i>2</i>
              <b>Diff</b>
            </span>
            <span className="write-flow-line" />
            <span className="write-flow-step">
              <i>3</i>
              <b>确认</b>
            </span>
            <span className="write-flow-line" />
            <span className="write-flow-step">
              <i>4</i>
              <b>备份</b>
            </span>
          </div>
          <button
            className="button button-secondary"
            onClick={() => onNavigate("configs")}
          >
            打开配置中心 <Icon name="arrow" size={15} />
          </button>
        </article>
      </section>
    </div>
  );
}

const REDACTED = "••••••";

function ConfigFormEditor({
  schema,
  formState,
  setFormState,
  source,
  format,
}: {
  schema: AgentFormSchema;
  formState: Record<string, unknown>;
  setFormState: (state: Record<string, unknown>) => void;
  source: string;
  format: string;
}) {
  const { known, unknown: unknownFields } = splitKnownUnknown(
    formState,
    schema,
  );

  const originalParsed = useMemo(() => {
    try {
      return parseConfigSource(format as "json" | "jsonc" | "toml", source);
    } catch {
      return {};
    }
  }, [source, format]);

  function updateField(key: string, value: unknown) {
    setFormState({ ...formState, [key]: value });
  }

  return (
    <div className="form-editor">
      {schema.fields.length > 0 && (
        <div className="form-section">
          {schema.fields.map((field) => (
            <FormField
              key={field.key}
              field={field}
              value={known[field.key]}
              originalValue={originalParsed[field.key]}
              onChange={(v) => updateField(field.key, v)}
            />
          ))}
        </div>
      )}
      {schema.fields.length === 0 && (
        <p className="form-warning" role="status">
          <Icon name="warning" size={14} />该 Agent
          暂无已知字段定义，所有字段显示在"其他字段"中。可切换到源码模式编辑。
        </p>
      )}
      <UnknownFieldsSection fields={unknownFields} />
    </div>
  );
}

function FormField({
  field,
  value,
  originalValue,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  originalValue: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case "boolean":
      return (
        <BooleanFieldRow field={field} value={value} onChange={onChange} />
      );
    case "enum":
      return <EnumFieldRow field={field} value={value} onChange={onChange} />;
    case "key-value-map":
      return (
        <KeyValueMapEditor
          field={field}
          value={value}
          originalValue={originalValue}
          onChange={onChange}
        />
      );
    case "nested-object":
      return (
        <NestedObjectEditor
          field={field}
          value={value}
          originalValue={originalValue}
          onChange={onChange}
        />
      );
    default:
      return <TextFieldRow field={field} value={value} onChange={onChange} />;
  }
}

function TextFieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const strValue = typeof value === "string" ? value : "";
  const isMasked = field.sensitive && strValue === REDACTED;
  return (
    <div className="form-field-row">
      <div>
        <strong>{field.label}</strong>
        {field.description && <span>{field.description}</span>}
      </div>
      {isMasked ? (
        <span className="setting-value">已遮罩</span>
      ) : (
        <input
          className="form-input"
          type="text"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function BooleanFieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const boolValue = value === true;
  return (
    <div className="form-field-row">
      <div>
        <strong>{field.label}</strong>
        {field.description && <span>{field.description}</span>}
      </div>
      <button
        type="button"
        className={`toggle ${boolValue ? "on" : ""}`}
        onClick={() => onChange(!boolValue)}
        aria-pressed={boolValue}
        aria-label={field.label}
      >
        <i />
      </button>
    </div>
  );
}

function EnumFieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const strValue = typeof value === "string" ? value : "";
  return (
    <div className="form-field-row">
      <div>
        <strong>{field.label}</strong>
        {field.description && <span>{field.description}</span>}
      </div>
      <select
        className="form-select"
        value={strValue}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">未设置</option>
        {field.enumValues?.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function KeyValueMapEditor({
  field,
  value,
  originalValue,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  originalValue: unknown;
  onChange: (value: unknown) => void;
}) {
  const map =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const originalMap =
    originalValue &&
    typeof originalValue === "object" &&
    !Array.isArray(originalValue)
      ? (originalValue as Record<string, unknown>)
      : {};
  const entries = Object.entries(map);
  const isBooleanValues = field.kvValueType === "boolean";

  function updateEntry(oldKey: string, newKey: string, newValue: unknown) {
    const next: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      if (k === oldKey) next[newKey] = newValue;
      else next[k] = v;
    }
    onChange(next);
  }
  function removeEntry(key: string) {
    const next = { ...map };
    delete next[key];
    onChange(next);
  }
  function addEntry() {
    const next = { ...map };
    let newKey = "new_key";
    let i = 1;
    while (newKey in next) {
      newKey = `new_key_${i++}`;
    }
    next[newKey] = isBooleanValues ? true : "";
    onChange(next);
  }

  return (
    <div className="form-field-row kv-section">
      <div className="kv-header">
        <strong>{field.label}</strong>
        {field.description && <span>{field.description}</span>}
      </div>
      <div className="kv-editor">
        {entries.map(([key, val]) => {
          const isMasked =
            field.sensitive &&
            typeof val === "string" &&
            val === REDACTED &&
            key in originalMap;
          return (
            <div key={key} className="kv-row">
              <input
                className="form-input"
                type="text"
                value={key}
                onChange={(e) => updateEntry(key, e.target.value, val)}
                placeholder="Key"
              />
              {isBooleanValues ? (
                <button
                  type="button"
                  className={`toggle ${val === true ? "on" : ""}`}
                  onClick={() => updateEntry(key, key, !val)}
                  aria-pressed={val === true}
                  aria-label={`${key} 开关`}
                >
                  <i />
                </button>
              ) : isMasked ? (
                <span className="setting-value kv-masked">已遮罩</span>
              ) : (
                <input
                  className="form-input"
                  type="text"
                  value={typeof val === "string" ? val : String(val ?? "")}
                  onChange={(e) => updateEntry(key, key, e.target.value)}
                  placeholder="Value"
                />
              )}
              <button
                type="button"
                className="icon-button kv-remove"
                onClick={() => removeEntry(key)}
                aria-label={`删除 ${key}`}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="button button-ghost kv-add-button"
          onClick={addEntry}
        >
          <Icon name="plus" size={14} />
          添加
        </button>
      </div>
    </div>
  );
}

function NestedObjectEditor({
  field,
  value,
  originalValue,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  originalValue: unknown;
  onChange: (value: unknown) => void;
}) {
  const obj =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const origObj =
    originalValue &&
    typeof originalValue === "object" &&
    !Array.isArray(originalValue)
      ? (originalValue as Record<string, unknown>)
      : {};

  function updateChild(key: string, childValue: unknown) {
    onChange({ ...obj, [key]: childValue });
  }

  if (!field.nestedFields?.length) return null;

  return (
    <div className="form-field-row nested-group">
      <div className="nested-group-header">
        <strong>{field.label}</strong>
        {field.description && <span>{field.description}</span>}
      </div>
      <div className="nested-group-body">
        {field.nestedFields.map((child) => (
          <FormField
            key={child.key}
            field={child}
            value={obj[child.key]}
            originalValue={origObj[child.key]}
            onChange={(v) => updateChild(child.key, v)}
          />
        ))}
      </div>
    </div>
  );
}

function UnknownFieldsSection({ fields }: { fields: Record<string, unknown> }) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return null;
  return (
    <div className="form-section unknown-fields">
      <div className="form-section-title">
        <strong>其他字段</strong>
        <span>以下字段未纳入表单，保存时会原样保留</span>
      </div>
      <pre className="source-preview">{JSON.stringify(fields, null, 2)}</pre>
    </div>
  );
}

function ConfigCenter({
  configs,
  workspaceConfigs,
  selectedScope,
  setSelectedScope,
  selectedAgent,
  setSelectedAgent,
  selectedConfig,
  editing,
  editMode,
  setEditMode,
  formState,
  setFormState,
  source,
  draft,
  setDraft,
  preview,
  saveMessage,
  onEdit,
  onCancel,
  onPreview,
  onSave,
  saving,
  searchQuery,
}: {
  configs: ConfigDocument[];
  workspaceConfigs: ConfigDocument[];
  selectedScope: ConfigDocument["scope"];
  setSelectedScope: (scope: ConfigDocument["scope"]) => void;
  selectedAgent: ConfigDocument["agent"];
  setSelectedAgent: (agent: ConfigDocument["agent"]) => void;
  selectedConfig?: ConfigDocument;
  editing: boolean;
  editMode: "form" | "source";
  setEditMode: (mode: "form" | "source") => void;
  formState: Record<string, unknown>;
  setFormState: (state: Record<string, unknown>) => void;
  source: string;
  draft: string;
  setDraft: (value: string) => void;
  preview?: ConfigEditPreview;
  saveMessage?: string;
  onEdit: () => void;
  onCancel: () => void;
  onPreview: () => void;
  onSave: () => void;
  saving: boolean;
  searchQuery: string;
}) {
  const visibleConfigs =
    selectedScope === "global" ? configs : workspaceConfigs;
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredConfigs = normalizedQuery
    ? visibleConfigs.filter((config) => {
        const agentName = agentMeta[config.agent].name.toLocaleLowerCase();
        return [agentName, config.path, statusLabel(config.status)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
    : visibleConfigs;

  if (editing && selectedConfig) {
    const meta = agentMeta[selectedConfig.agent];
    return (
      <div className="page config-edit-page">
        <div className="config-edit-topbar">
          <button
            className="button button-ghost config-back-button"
            onClick={onCancel}
          >
            <Icon name="arrow" size={15} />
            返回
          </button>
          <div className="config-edit-topbar-title">
            <div className={`agent-avatar small ${meta.tone}`}>{meta.mark}</div>
            <strong>
              {meta.name}{" "}
              {selectedConfig.scope === "global" ? "全局" : "工作空间"}配置
            </strong>
          </div>
          <div className="config-edit-topbar-actions">
            <button className="button button-secondary" onClick={onPreview}>
              <Icon name="check" size={16} />
              生成 Diff
            </button>
          </div>
        </div>
        <div
          className="scope-switch edit-mode-switch"
          role="group"
          aria-label="编辑模式"
        >
          <button
            className={editMode === "form" ? "selected" : ""}
            aria-pressed={editMode === "form"}
            onClick={() => setEditMode("form")}
          >
            <Icon name="sliders" size={14} />
            表单
          </button>
          <button
            className={editMode === "source" ? "selected" : ""}
            aria-pressed={editMode === "source"}
            onClick={() => setEditMode("source")}
          >
            <Icon name="file" size={14} />
            源码
          </button>
        </div>
        {(selectedConfig.format === "jsonc" ||
          selectedConfig.format === "toml") &&
          editMode === "form" && (
            <p className="form-warning" role="status">
              <Icon name="warning" size={14} />
              表单模式会移除原始注释。若需保留注释，请使用源码模式。
            </p>
          )}
        <div className="config-edit-body">
          {editMode === "form" ? (
            <ConfigFormEditor
              schema={AGENT_SCHEMAS[selectedConfig.agent]}
              formState={formState}
              setFormState={setFormState}
              source={source}
              format={selectedConfig.format}
            />
          ) : (
            <div className="editor-block">
              <label className="editor-label" htmlFor="config-editor">
                配置原文
              </label>
              <textarea
                id="config-editor"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                spellCheck={false}
              />
              <div className="editor-hint">
                原始内容 {source.length.toLocaleString()} 字符
              </div>
            </div>
          )}
        </div>
        {preview && (
          <div className="diff-block">
            <div className="source-heading">
              <span>即将写入的变更</span>
              <span className={preview.changed ? "diff-changed" : ""}>
                {preview.changed ? "有变更" : "无变更"}
              </span>
            </div>
            <pre>{preview.diff}</pre>
            <div className="diff-actions">
              <button className="button button-ghost" onClick={onCancel}>
                取消
              </button>
              <button
                className="button button-primary"
                disabled={!preview.changed || saving}
                onClick={onSave}
              >
                {saving ? "保存中…" : "确认写入并备份"}
              </button>
            </div>
          </div>
        )}
        {saveMessage && (
          <p className="inline-message" role="status">
            {saveMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="sr-only">配置中心</h1>
      <div className="config-layout">
        <aside className="config-sidebar">
          <div className="scope-switch" role="group" aria-label="配置作用域">
            <button
              className={selectedScope === "global" ? "selected" : ""}
              aria-pressed={selectedScope === "global"}
              onClick={() => setSelectedScope("global")}
            >
              全局
            </button>
            <button
              className={selectedScope === "workspace" ? "selected" : ""}
              aria-pressed={selectedScope === "workspace"}
              disabled={!workspaceConfigs.length}
              onClick={() => setSelectedScope("workspace")}
            >
              工作空间
            </button>
          </div>
          {(["claude-code", "codex", "opencode"] as const).map((agent) => {
            const config = visibleConfigs.find((item) => item.agent === agent);
            const meta = agentMeta[agent];
            if (
              normalizedQuery &&
              !filteredConfigs.some((item) => item.agent === agent)
            )
              return null;
            return (
              <button
                key={agent}
                className={`config-agent ${selectedAgent === agent ? "selected" : ""}`}
                aria-pressed={selectedAgent === agent}
                onClick={() => {
                  setSelectedAgent(agent);
                  onCancel();
                }}
              >
                <div className={`agent-avatar small ${meta.tone}`}>
                  {meta.mark}
                </div>
                <span>
                  <strong>{meta.name}</strong>
                  <small>
                    {config ? statusLabel(config.status) : "等待扫描"}
                  </small>
                </span>
                <span
                  className={`status-dot ${config?.status === "ready" ? "ready" : ""}`}
                />
              </button>
            );
          })}
        </aside>
        <section className="config-detail">
          {selectedConfig ? (
            <>
              <div className="detail-heading">
                <div className="detail-title">
                  <div
                    className={`agent-avatar small ${agentMeta[selectedConfig.agent].tone}`}
                  >
                    {agentMeta[selectedConfig.agent].mark}
                  </div>
                  <div>
                    <h2>
                      {agentMeta[selectedConfig.agent].name}{" "}
                      {selectedConfig.scope === "global" ? "全局" : "工作空间"}
                      配置
                    </h2>
                    <p>{selectedConfig.path}</p>
                  </div>
                </div>
                <div
                  className={`config-status status-${selectedConfig.status}`}
                >
                  <span className="status-dot" />
                  {statusLabel(selectedConfig.status)}
                </div>
              </div>
              <div className="config-info-grid">
                <div>
                  <span>文件格式</span>
                  <strong>{selectedConfig.format.toUpperCase()}</strong>
                </div>
                <div>
                  <span>最后修改</span>
                  <strong>
                    {selectedConfig.modifiedAtMs
                      ? new Date(selectedConfig.modifiedAtMs).toLocaleString(
                          "zh-CN",
                        )
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>校验和</span>
                  <strong className="mono">
                    {selectedConfig.checksum
                      ? `${selectedConfig.checksum.slice(0, 12)}…`
                      : "—"}
                  </strong>
                </div>
              </div>
              {selectedConfig.diagnostics.length > 0 && (
                <div className="inline-diagnostics" role="status">
                  <Icon name="warning" size={17} />
                  <span>
                    <strong>
                      发现 {selectedConfig.diagnostics.length} 个诊断
                    </strong>
                    {selectedConfig.diagnostics[0].message}
                  </span>
                </div>
              )}
              <div className="source-block">
                <div className="source-heading">
                  <span>
                    <Icon name="file" size={16} />
                    遮罩预览
                  </span>
                  <span>默认只读</span>
                </div>
                <pre className="source-preview">
                  {selectedConfig.sourcePreview || "暂无可读取的配置文件"}
                </pre>
                <div className="source-actions">
                  <button
                    className="button button-primary"
                    disabled={selectedConfig.status !== "ready"}
                    onClick={onEdit}
                  >
                    <Icon name="edit" size={16} />
                    编辑
                  </button>
                </div>
              </div>
            </>
          ) : normalizedQuery ? (
            <div className="empty-state large">
              <div className="empty-icon">
                <Icon name="search" size={24} />
              </div>
              <h2>没有匹配的配置</h2>
              <p>试试搜索 Agent 名称、文件路径或状态，例如“Codex”。</p>
            </div>
          ) : (
            <div className="empty-state large">
              <div className="empty-icon">
                <Icon name="file" size={24} />
              </div>
              <h2>还没有扫描结果</h2>
              <p>点击右上角"重新扫描"，AgentHub 会从本地读取配置状态。</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SkillsCenter({
  skills,
  searchQuery,
  onScan,
  onNavigate,
  workspaces,
  onInstalled,
  diagnosticFocus,
  onDismissDiagnostic,
}: {
  skills?: SkillInventory;
  searchQuery: string;
  onScan: () => void;
  onNavigate: (section: Section) => void;
  workspaces: WorkspaceRecord[];
  onInstalled: (workspaceDirectory?: string) => void;
  diagnosticFocus?: UnifiedDiagnostic;
  onDismissDiagnostic: () => void;
}) {
  const [filter, setFilter] = useState<
    "all" | "global" | "workspace" | "managed" | "external"
  >("all");
  const [showSourceGuide, setShowSourceGuide] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredSkills = useMemo(
    () =>
      (skills?.skills ?? []).filter((skill) => {
        const matchesFilter =
          filter === "all" ||
          (filter === "managed" && skill.sourceTracked) ||
          (filter === "external" && !skill.sourceTracked) ||
          skill.scope === filter;
        const haystack = [
          skill.displayName,
          skill.relativePath,
          skill.path,
          skill.agent,
        ]
          .join(" ")
          .toLocaleLowerCase();
        return (
          matchesFilter &&
          (!normalizedQuery || haystack.includes(normalizedQuery))
        );
      }),
    [filter, normalizedQuery, skills],
  );
  const groups = useMemo(() => {
    const result = new Map<string, InstalledSkill[]>();
    filteredSkills.forEach((skill) => {
      const key = skill.agent;
      result.set(key, [...(result.get(key) ?? []), skill]);
    });
    return result;
  }, [filteredSkills]);
  const focusedSkills = useMemo(
    () =>
      diagnosticFocus
        ? matchingSkillsForDiagnostic(diagnosticFocus, skills?.skills ?? [])
        : [],
    [diagnosticFocus, skills],
  );
  useEffect(() => {
    if (!diagnosticFocus) return;
    const panel = document.getElementById("focused-skill-diagnostic");
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    panel?.scrollIntoView({
      block: "start",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    panel?.focus({ preventScroll: true });
  }, [diagnosticFocus]);
  const filters = [
    ["all", "全部"],
    ["global", "全局"],
    ["workspace", "工作空间"],
    ["managed", "AgentHub 管理"],
    ["external", "外部管理"],
  ] as const;
  return (
    <div className="page">
      <h1 className="sr-only">Skills</h1>
      <div className="skill-toolbar">
        <div className="source-chips" role="group" aria-label="Skill 筛选">
          {filters.map(([value, label]) => (
            <button
              className={`chip ${filter === value ? "active" : ""}`}
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
              {value === "all" && <b>{skills?.skills.length ?? 0}</b>}
            </button>
          ))}
        </div>
        <div className="skill-toolbar-actions">
          <button
            className="button button-secondary"
            aria-expanded={showSourceGuide}
            aria-controls="source-guide"
            onClick={() => setShowSourceGuide((visible) => !visible)}
          >
            <Icon name="plus" size={16} />
            添加来源
          </button>
          <button className="button button-ghost" onClick={onScan}>
            <Icon name="refresh" size={16} />
            扫描 Skills
          </button>
        </div>
      </div>
      {showSourceGuide && (
        <SkillSourcePanel
          id="source-guide"
          workspaces={workspaces}
          onNavigate={onNavigate}
          onInstalled={onInstalled}
        />
      )}
      {skills?.duplicateNames.length ? (
        <div className="alert alert-warning" role="status">
          <Icon name="warning" />
          <span>
            发现同名 Skill：{skills.duplicateNames.join("、")}
            。请确认优先级后再启用。
          </span>
          <button
            type="button"
            aria-expanded={showDuplicates}
            aria-controls="duplicate-skill-details"
            onClick={() => setShowDuplicates((visible) => !visible)}
          >
            {showDuplicates ? "收起重复项" : "查看重复项"}
          </button>
        </div>
      ) : null}
      {showDuplicates && skills?.duplicateNames.length ? (
        <section
          className="skill-issue-panel duplicate-skill-panel"
          id="duplicate-skill-details"
          aria-labelledby="duplicate-skill-title"
        >
          <div className="skill-issue-heading">
            <div>
              <p className="eyebrow">重复安装</p>
              <h2 id="duplicate-skill-title">选择需要保留的 Skill</h2>
              <p>
                同名 Skill 出现在多个位置时，Agent
                的加载顺序可能不同。请比较路径和作用域，再停用不需要的副本。
              </p>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="关闭重复 Skill 详情"
              onClick={() => setShowDuplicates(false)}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="duplicate-skill-groups">
            {skills.duplicateNames.map((name) => {
              const matches = skills.skills.filter(
                (skill) => skill.name === name || skill.displayName === name,
              );
              return (
                <article key={name}>
                  <strong>{name}</strong>
                  <span>{matches.length} 个安装位置</span>
                  <div>
                    {matches.map((skill) => (
                      <SkillLocation
                        key={`${skill.agent}-${skill.scope}-${skill.path}`}
                        skill={skill}
                      />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      {diagnosticFocus ? (
        <section
          className={`skill-issue-panel ${diagnosticFocus.severity}`}
          id="focused-skill-diagnostic"
          aria-labelledby="focused-skill-diagnostic-title"
          tabIndex={-1}
        >
          <div className="skill-issue-heading">
            <div>
              <p className="eyebrow">Skill 问题详情</p>
              <h2 id="focused-skill-diagnostic-title">
                {diagnosticSubject(diagnosticFocus)}
              </h2>
              <p>{diagnosticProblem(diagnosticFocus)}</p>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="关闭 Skill 问题详情"
              onClick={onDismissDiagnostic}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <dl className="skill-issue-facts">
            <div>
              <dt>可能影响</dt>
              <dd>{diagnosticFocus.impact}</dd>
            </div>
            <div>
              <dt>处理建议</dt>
              <dd>{diagnosticFocus.nextAction}</dd>
            </div>
            <div>
              <dt>诊断码</dt>
              <dd className="mono">{diagnosticFocus.code}</dd>
            </div>
            {diagnosticFocus.resourcePath && (
              <div>
                <dt>问题位置</dt>
                <dd className="mono">{diagnosticFocus.resourcePath}</dd>
              </div>
            )}
          </dl>
          {focusedSkills.length > 0 && (
            <div className="skill-issue-locations">
              <strong>
                {focusedSkills.length > 1 ? "冲突安装位置" : "已识别的 Skill"}
              </strong>
              {focusedSkills.map((skill) => (
                <SkillLocation
                  key={`${skill.agent}-${skill.scope}-${skill.path}`}
                  skill={skill}
                />
              ))}
            </div>
          )}
          <div className="skill-issue-actions">
            <button
              className="button button-ghost"
              onClick={onDismissDiagnostic}
            >
              关闭
            </button>
            <button className="button button-secondary" onClick={onScan}>
              <Icon name="refresh" size={15} />
              重新扫描
            </button>
          </div>
        </section>
      ) : null}
      <div className="skill-grid">
        {skills && filteredSkills.length > 0 ? (
          Array.from(groups.entries()).map(([agent, items]) => (
            <section className="skill-group" key={agent}>
              <div className="group-heading">
                <div
                  className={`agent-avatar small ${agentMeta[agent as keyof typeof agentMeta].tone}`}
                >
                  {agentMeta[agent as keyof typeof agentMeta].mark}
                </div>
                <div>
                  <h2>{agentMeta[agent as keyof typeof agentMeta].name}</h2>
                  <span>{items.length} 个 Skill · 全局与工作空间</span>
                </div>
              </div>
              {items.map((skill) => (
                <article
                  className="skill-row"
                  key={`${skill.agent}-${skill.scope}-${skill.path}`}
                >
                  <div className="skill-icon">
                    <Icon name="spark" size={17} />
                  </div>
                  <div className="skill-copy">
                    <strong>{skill.displayName}</strong>
                    <span>
                      {skill.relativePath} · {skill.compatibility ?? "通用兼容"}
                    </span>
                    <small>
                      {skillSourceLabel(skill.source.kind)} ·{" "}
                      {skill.enabled ? "已启用" : "已停用"}
                    </small>
                    <code className="skill-path" title={skill.path}>
                      {skill.path}
                    </code>
                  </div>
                  <span className={`scope-pill ${skill.scope}`}>
                    {skill.scope === "global" ? "全局" : "工作空间"}
                  </span>
                  <span className="managed-pill">
                    {skill.sourceTracked ? "AgentHub 管理" : "外部管理"}
                  </span>
                </article>
              ))}
            </section>
          ))
        ) : (
          <div className="empty-state large">
            <div className="empty-icon">
              <Icon name="spark" size={24} />
            </div>
            <h2>还没有发现 Skill</h2>
            <p>
              {normalizedQuery || filter !== "all"
                ? "没有符合当前搜索或筛选条件的 Skill。"
                : "添加本地目录、Git 仓库或标准 Marketplace 后，在这里统一查看。"}
            </p>
            <button
              className="button button-primary"
              onClick={() => setShowSourceGuide(true)}
            >
              <Icon name="plus" size={16} />
              添加第一个来源
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SkillLocation({ skill }: { skill: InstalledSkill }) {
  return (
    <div className="skill-location">
      <div>
        <strong>{getAgentMeta(skill.agent).name}</strong>
        <span>
          {skill.scope === "global" ? "全局" : "工作空间"} ·{" "}
          {skill.sourceTracked ? "AgentHub 管理" : "外部管理"}
        </span>
      </div>
      <code>{skill.path}</code>
    </div>
  );
}

const presetSkillRepositories = [
  ["anthropics/skills", "Anthropic 官方"],
  ["mattpocock/skills", "Matt Pocock"],
  ["obra/superpowers", "Superpowers"],
  ["affaan-m/ECC", "Everything Claude Code"],
] as const;

function discoveredSkillKey(skill: {
  source: { kind: string; locator: string };
  relativePath: string;
}) {
  return `${skill.source.kind}:${skill.source.locator}:${skill.relativePath}`;
}

function SkillSourcePanel({
  id,
  workspaces,
  onNavigate,
  onInstalled,
}: {
  id: string;
  workspaces: WorkspaceRecord[];
  onNavigate: (section: Section) => void;
  onInstalled: (workspaceDirectory?: string) => void;
}) {
  const [mode, setMode] = useState<SkillSourceMode>("skills-sh");
  const [locator, setLocator] = useState("anthropics/skills");
  const [requestedRef, setRequestedRef] = useState("");
  const [subdirectory, setSubdirectory] = useState("");
  const [browseResult, setBrowseResult] = useState<SkillSourceBrowseResult>();
  const [selectedSkillKey, setSelectedSkillKey] = useState("");
  const [agent, setAgent] = useState<"claude-code" | "codex" | "opencode">(
    "claude-code",
  );
  const [scope, setScope] = useState<"global" | "workspace">("global");
  const [workspaceId, setWorkspaceId] = useState<number | "">("");
  const [plan, setPlan] = useState<SkillInstallPlanPreview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const request = useMemo<SkillSourceRequest | undefined>(
    () =>
      buildSkillSourceRequest({
        mode,
        locator,
        requestedRef,
        subdirectory,
      }),
    [locator, mode, requestedRef, subdirectory],
  );

  const selectedSkill = browseResult?.skills.find(
    (skill) => discoveredSkillKey(skill) === selectedSkillKey,
  );
  const workspace = workspaces.find((item) => item.id === workspaceId);

  async function chooseLocalDirectory() {
    const path = await selectSkillSourceDirectory();
    if (path) setLocator(path);
  }

  async function chooseMarketplaceManifest() {
    const path = await selectMarketplaceManifest();
    if (path) setLocator(path);
  }

  async function browse() {
    if (!request || busy) return;
    setBusy(true);
    setMessage(undefined);
    setPlan(undefined);
    setSelectedSkillKey("");
    try {
      const result = await browseSkillSource(request);
      setBrowseResult(result);
      const first = result.skills.find((skill) => skill.installable);
      if (first) setSelectedSkillKey(discoveredSkillKey(first));
      if (!result.skills.length && result.catalogEntries.length) {
        setMessage(
          "已读取 Marketplace 条目；远程条目需要先解析为可获取的来源。",
        );
      }
    } catch (error) {
      setBrowseResult(undefined);
      setMessage(errorMessage(error, "来源读取失败，请检查地址后重试。"));
    } finally {
      setBusy(false);
    }
  }

  async function createPlan() {
    if (!request || !selectedSkill?.installable || busy) return;
    if (scope === "workspace" && !workspace) {
      setMessage("请先选择已登记的工作空间。");
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      setPlan(
        await planSkillInstall({
          request,
          skillPath: selectedSkill.relativePath,
          skillSourceLocator: selectedSkill.source.locator,
          agent,
          scope,
          workspaceDirectory: workspace?.normalizedPath,
          workspaceId: workspace?.id,
        }),
      );
    } catch (error) {
      setMessage(errorMessage(error, "无法生成安装计划，请重新扫描来源。"));
    } finally {
      setBusy(false);
    }
  }

  async function install() {
    if (!plan || busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await applySkillInstall(plan.planId);
      setMessage("Skill 已安装，并已记录来源与版本。");
      setPlan(undefined);
      onInstalled(workspace?.normalizedPath);
    } catch (error) {
      setMessage(errorMessage(error, "安装未完成，磁盘状态未被静默覆盖。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="source-guide skill-source-panel"
      id={id}
      aria-labelledby={`${id}-title`}
    >
      <div className="source-guide-heading">
        <div>
          <p className="eyebrow">来源与安装</p>
          <h2 id={`${id}-title`}>发现 Skill，确认后安装</h2>
          <p>
            skills.sh、远程 Git、本地目录和 Marketplace
            共用同一条只读扫描与安全安装流程。
          </p>
        </div>
        <button
          className="button button-ghost"
          onClick={() => onNavigate("workspaces")}
        >
          <Icon name="folder" size={16} />
          管理工作空间
        </button>
      </div>
      <div
        className="skill-source-tabs"
        role="tablist"
        aria-label="Skill 来源类型"
      >
        {(
          [
            ["skills-sh", "skills.sh"],
            ["git", "远程 Git"],
            ["local-directory", "本地目录"],
            ["marketplace", "Marketplace"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={mode === value ? "active" : ""}
            role="tab"
            aria-selected={mode === value}
            onClick={() => {
              setMode(value);
              setBrowseResult(undefined);
              setPlan(undefined);
              setMessage(undefined);
              if (value === "skills-sh") setLocator("anthropics/skills");
              if (value === "git")
                setLocator("https://github.com/anthropics/skills.git");
              if (value === "local-directory") setLocator("");
              if (value === "marketplace") setLocator("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="skill-source-form">
        <label>
          {mode === "skills-sh"
            ? "仓库标识"
            : mode === "git"
              ? "Git 仓库 URL"
              : mode === "local-directory"
                ? "来源目录"
                : "Marketplace manifest"}
          <input
            value={locator}
            onChange={(event) => setLocator(event.target.value)}
            placeholder={
              mode === "skills-sh"
                ? "owner/repository"
                : mode === "git"
                  ? "https://github.com/owner/repo.git"
                  : mode === "local-directory"
                    ? "/path/to/skills"
                    : "/path/to/.claude-plugin/marketplace.json"
            }
          />
        </label>
        {mode === "git" && (
          <>
            <label>
              ref（可选）
              <input
                value={requestedRef}
                onChange={(event) => setRequestedRef(event.target.value)}
                placeholder="main / v1.0.0 / commit"
              />
            </label>
            <label>
              子目录（可选）
              <input
                value={subdirectory}
                onChange={(event) => setSubdirectory(event.target.value)}
                placeholder="skills"
              />
            </label>
          </>
        )}
        {(mode === "git" || mode === "skills-sh") && (
          <label>
            预置仓库
            <select
              value={
                presetSkillRepositories.some(([value]) =>
                  locator.includes(value),
                )
                  ? presetSkillRepositories.find(([value]) =>
                      locator.includes(value),
                    )?.[0]
                  : ""
              }
              onChange={(event) =>
                event.target.value &&
                setLocator(
                  mode === "git"
                    ? `https://github.com/${event.target.value}.git`
                    : event.target.value,
                )
              }
            >
              <option value="">
                {mode === "git" ? "自定义 Git 地址" : "自定义 skills.sh 来源"}
              </option>
              {presetSkillRepositories.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}（{value}）
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === "local-directory" && (
          <button
            className="button button-ghost"
            type="button"
            onClick={() => void chooseLocalDirectory()}
          >
            <Icon name="folder" size={15} />
            选择目录
          </button>
        )}
        {mode === "marketplace" && (
          <button
            className="button button-ghost"
            type="button"
            onClick={() => void chooseMarketplaceManifest()}
          >
            <Icon name="file" size={15} />
            选择 manifest
          </button>
        )}
        <button
          className="button button-primary"
          type="button"
          disabled={!request || busy}
          onClick={() => void browse()}
        >
          <Icon name="search" size={15} />
          {busy ? "读取中…" : "读取来源"}
        </button>
      </div>
      {browseResult && (
        <div className="skill-source-results">
          <div className="source-result-heading">
            <div>
              <strong>{browseResult.source.locator}</strong>
              <small>
                {browseResult.source.resolvedCommit
                  ? `版本 ${browseResult.source.resolvedCommit.slice(0, 12)}`
                  : "来源已读取"}
              </small>
            </div>
            {browseResult.skills.length > 0 && (
              <span>{browseResult.skills.length} 个 Skill</span>
            )}
          </div>
          {browseResult.diagnostics.map((item) => (
            <p
              className={`source-diagnostic ${item.severity}`}
              key={`${item.code}-${item.message}`}
            >
              <Icon
                name={item.severity === "error" ? "warning" : "file"}
                size={14}
              />
              {item.message}
            </p>
          ))}
          {browseResult.catalogEntries.length > 0 && (
            <div className="source-catalog">
              {browseResult.catalogEntries.map((entry, index) => (
                <div key={`${entry.name ?? "entry"}-${index}`}>
                  <strong>{entry.name ?? "未命名条目"}</strong>
                  <span>
                    {entry.installable ? "可安装来源" : "需要补充来源"}
                  </span>
                  <small>{entry.description ?? "暂无描述"}</small>
                </div>
              ))}
            </div>
          )}
          {browseResult.skills.length > 0 && (
            <div className="source-skill-list">
              {browseResult.skills.map((skill) => (
                <button
                  key={skill.relativePath}
                  className={
                    selectedSkillKey === discoveredSkillKey(skill)
                      ? "selected"
                      : ""
                  }
                  disabled={!skill.installable}
                  onClick={() => setSelectedSkillKey(discoveredSkillKey(skill))}
                >
                  <span>
                    <strong>{skill.displayName}</strong>
                    <small>
                      {skill.relativePath} · {skill.description ?? "暂无描述"}
                    </small>
                  </span>
                  <em>{skill.installable ? "可安装" : "需处理"}</em>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {selectedSkill && (
        <div className="skill-install-target">
          <label>
            目标 Agent
            <select
              value={agent}
              onChange={(event) => setAgent(event.target.value as typeof agent)}
            >
              {defaultAgentIds.map((id) => (
                <option key={id} value={id}>
                  {getAgentMeta(id).name}
                </option>
              ))}
            </select>
          </label>
          <label>
            作用域
            <select
              value={scope}
              onChange={(event) => {
                const nextScope = event.target.value as typeof scope;
                setScope(nextScope);
                if (
                  nextScope === "workspace" &&
                  workspaceId === "" &&
                  workspaces[0]
                ) {
                  setWorkspaceId(workspaces[0].id);
                }
              }}
            >
              <option value="global">全局</option>
              <option value="workspace">工作空间</option>
            </select>
          </label>
          {scope === "workspace" && (
            <label>
              工作空间
              <select
                value={workspaceId}
                onChange={(event) =>
                  setWorkspaceId(
                    event.target.value ? Number(event.target.value) : "",
                  )
                }
              >
                <option value="">请选择已登记工作空间</option>
                {workspaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="button button-secondary"
            disabled={busy || !selectedSkill.installable}
            onClick={() => void createPlan()}
          >
            {busy ? "生成中…" : "生成安装计划"}
          </button>
        </div>
      )}
      {plan && (
        <div className="skill-install-plan">
          <div>
            <span className="eyebrow">安装前确认</span>
            <h3>{plan.displayName}</h3>
            <p>{plan.description ?? "无描述"}</p>
          </div>
          <dl>
            <div>
              <dt>来源版本</dt>
              <dd>{plan.plan.sourceRevision ?? "未提供"}</dd>
            </div>
            <div>
              <dt>目标</dt>
              <dd>
                {getAgentMeta(plan.plan.agent).name} ·{" "}
                {plan.plan.scope === "global" ? "全局" : "工作空间"}
              </dd>
            </div>
            <div>
              <dt>文件</dt>
              <dd>{plan.plan.files.length} 个受管文件</dd>
            </div>
            <div>
              <dt>目标路径</dt>
              <dd className="mono">{plan.plan.targetDirectory}</dd>
            </div>
          </dl>
          <details className="skill-plan-files">
            <summary>查看 {plan.plan.files.length} 个文件</summary>
            <ul>
              {plan.plan.files.map((file) => (
                <li className="mono" key={file}>
                  {file}
                </li>
              ))}
            </ul>
          </details>
          <div className="skill-install-plan-actions">
            <button
              className="button button-ghost"
              onClick={() => setPlan(undefined)}
            >
              取消
            </button>
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() => void install()}
            >
              {busy ? "安装中…" : "确认安装"}
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="inline-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function WorkspacesPage({
  workspaces,
  onChanged,
  onScanned,
  searchQuery,
}: {
  workspaces: WorkspaceRecord[];
  onChanged: () => void;
  onScanned: (result: WorkspaceScanResult) => void;
  searchQuery: string;
}) {
  const [path, setPath] = useState("");
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleWorkspaces = normalizedQuery
    ? workspaces.filter((workspace) =>
        [workspace.displayName, workspace.normalizedPath]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : workspaces;
  async function addAndScan() {
    if (!path.trim() || busy) return;
    setBusy(true);
    try {
      await addWorkspace(path.trim());
      const result = await scanWorkspace(path.trim());
      setMessage("工作空间已添加并完成扫描。");
      setPath("");
      onChanged();
      onScanned(result);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "工作空间添加失败，请检查目录后重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function chooseDirectory() {
    if (busy || choosing) return;
    setChoosing(true);
    setMessage(undefined);
    try {
      const selection = await selectWorkspaceDirectory();
      if (selection) {
        setPath(selection);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "无法打开目录选择器，请直接输入目录路径。",
      );
    } finally {
      setChoosing(false);
    }
  }
  async function remove(id: number) {
    try {
      await removeWorkspace(id);
      setMessage("已移除记录，磁盘目录没有被删除。");
      onChanged();
    } catch {
      setMessage("移除失败，请重新扫描后重试。");
    }
  }
  return (
    <div className="page">
      <h1 className="sr-only">工作空间</h1>
      <section className="workspace-add surface-card">
        <div>
          <p className="eyebrow">添加本地目录</p>
          <h2>接入一个工作空间</h2>
        </div>
        <div className="workspace-form">
          <label htmlFor="workspace-path">目录路径</label>
          <div className="workspace-path-row">
            <input
              id="workspace-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="例如 /Users/me/projects/demo"
            />
            <button
              className="button button-secondary"
              type="button"
              disabled={busy || choosing}
              onClick={() => void chooseDirectory()}
            >
              <Icon name="folder" size={16} />
              {choosing ? "选择中…" : "选择文件夹"}
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={!path.trim() || busy}
              onClick={addAndScan}
            >
              <Icon name="plus" size={16} />
              {busy ? "扫描中…" : "添加并扫描"}
            </button>
          </div>
          <small>路径会先规范化并拒绝符号链接，避免重复登记和越权扫描。</small>
        </div>
        {message && (
          <p className="inline-message" role="status" aria-live="polite">
            {message}
          </p>
        )}
      </section>
      <section className="workspace-list surface-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">已登记目录</p>
            <h2>
              {workspaces.length
                ? `${workspaces.length} 个工作空间`
                : "还没有工作空间"}
            </h2>
          </div>
        </div>
        {visibleWorkspaces.length ? (
          <div className="workspace-rows">
            {visibleWorkspaces.map((workspace) => (
              <article className="workspace-row" key={workspace.id}>
                <div className="quick-icon teal">
                  <Icon name="folder" size={17} />
                </div>
                <div>
                  <strong>{workspace.displayName}</strong>
                  <span>{workspace.normalizedPath}</span>
                </div>
                <button
                  className="button button-ghost"
                  onClick={() =>
                    void scanWorkspace(workspace.normalizedPath)
                      .then((result) => {
                        onChanged();
                        onScanned(result);
                      })
                      .catch(() =>
                        setMessage("重新扫描失败，请确认目录仍然存在。"),
                      )
                  }
                >
                  <Icon name="refresh" size={15} />
                  重扫
                </button>
                <button
                  className="icon-button"
                  aria-label={`移除 ${workspace.displayName}`}
                  onClick={() => void remove(workspace.id)}
                >
                  <Icon name="close" size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : normalizedQuery ? (
          <div className="workspace-empty">
            <div className="empty-icon">
              <Icon name="search" size={23} />
            </div>
            <h3>没有匹配的工作空间</h3>
            <p>试试项目名称或目录路径中的其他关键词。</p>
          </div>
        ) : (
          <div className="workspace-empty">
            <div className="empty-icon">
              <Icon name="folder" size={23} />
            </div>
            <h3>从一个项目目录开始</h3>
            <p>
              配置与 Skills 会按全局 /
              工作空间作用域分开显示，不会伪造合并结果。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function DiagnosticsPage({
  diagnostics,
  onNavigate,
  onViewSkillDetails,
  onRepair,
  searchQuery,
}: {
  diagnostics: UnifiedDiagnostic[];
  onNavigate: (section: Section) => void;
  onViewSkillDetails: (item: UnifiedDiagnostic) => void;
  onRepair: () => void;
  searchQuery: string;
}) {
  const [recoveryPreview, setRecoveryPreview] =
    useState<DiagnosticRecoveryPreview>();
  const [recoveryMessage, setRecoveryMessage] = useState<string>();
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const actionable = diagnostics
    .filter((item) => {
      if (item.severity === "info") return false;
      return (
        !normalizedQuery ||
        [
          item.code,
          diagnosticSubject(item),
          diagnosticProblem(item),
          item.impact,
          item.nextAction,
          item.resourcePath ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      );
    })
    .sort((left, right) => {
      const severityRank = { error: 0, warning: 1, info: 2 };
      const leftCodeRank = left.code === "skill:symlink-skipped" ? 2 : 0;
      const rightCodeRank = right.code === "skill:symlink-skipped" ? 2 : 0;
      return (
        severityRank[left.severity] - severityRank[right.severity] ||
        leftCodeRank - rightCodeRank ||
        diagnosticSubject(left).localeCompare(diagnosticSubject(right), "zh-CN")
      );
    });
  async function previewRecovery(item: UnifiedDiagnostic) {
    setRecoveryBusy(true);
    setRecoveryMessage(undefined);
    try {
      const preview = await previewDiagnosticRecovery({
        diagnosticCode: item.code,
        resourcePath: item.resourcePath ?? undefined,
      });
      setRecoveryPreview(preview);
    } catch {
      setRecoveryMessage("该问题需要在对应功能中手动处理，请按建议打开详情。");
    } finally {
      setRecoveryBusy(false);
    }
  }
  async function executeRecovery() {
    if (!recoveryPreview || recoveryBusy) return;
    setRecoveryBusy(true);
    try {
      const result = await executeDiagnosticRecovery({
        diagnosticCode: recoveryPreview.plan.diagnosticCode,
        resourcePath: recoveryPreview.plan.resourcePath ?? undefined,
        action: recoveryPreview.plan.action,
        recoveryId: recoveryPreview.recoveryId,
        previewed: true,
        confirmed: recoveryPreview.plan.confirmationRequired,
      });
      setRecoveryMessage(
        result.outcome === "applied"
          ? "修复已应用，并已刷新诊断。"
          : "安全恢复已执行，并已刷新诊断。",
      );
      setRecoveryPreview(undefined);
      onRepair();
    } catch {
      setRecoveryMessage("恢复未执行：状态可能已变化，请重新扫描后预览。");
    } finally {
      setRecoveryBusy(false);
    }
  }
  return (
    <div className="page">
      <h1 className="sr-only">诊断中心</h1>
      {recoveryMessage && (
        <div className="alert alert-warning" role="status" aria-live="polite">
          <Icon name="warning" />
          <span>{recoveryMessage}</span>
        </div>
      )}
      {actionable.length ? (
        <div className="diagnostic-list">
          {actionable.map((item) => (
            <article
              className={`diagnostic-card ${item.severity}`}
              key={`${item.code}-${item.resourcePath ?? "storage"}`}
            >
              <div className="diagnostic-icon">
                <Icon
                  name={item.severity === "error" ? "warning" : "file"}
                  size={18}
                />
              </div>
              <div className="diagnostic-copy">
                <div>
                  <strong>{diagnosticSubject(item)}</strong>
                  <span className="diagnostic-severity">
                    {item.severity === "error" ? "错误" : "警告"}
                  </span>
                </div>
                <p>{diagnosticProblem(item)}</p>
                <small>影响：{item.impact}</small>
                <small>建议：{item.nextAction}</small>
                <code className="diagnostic-code">{item.code}</code>
                {item.resourcePath && <code>{item.resourcePath}</code>}
              </div>
              <div className="diagnostic-actions">
                {item.fixSafety !== "manual" &&
                  !item.kind.includes("config") && (
                    <button
                      className="button button-secondary"
                      disabled={recoveryBusy}
                      onClick={() => void previewRecovery(item)}
                    >
                      查看处理方案
                    </button>
                  )}
                <button
                  className="button button-ghost"
                  onClick={() => {
                    if (item.code.startsWith("skill:")) {
                      onViewSkillDetails(item);
                      return;
                    }
                    onNavigate(item.agent ? "configs" : "settings");
                  }}
                >
                  {item.code.startsWith("skill:")
                    ? "查看 Skill 详情"
                    : "查看详情"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : normalizedQuery ? (
        <div className="empty-page compact">
          <div className="empty-icon">
            <Icon name="search" size={27} />
          </div>
          <h2>没有匹配的诊断</h2>
          <p>清除搜索或换一个诊断码、文件路径关键词。</p>
        </div>
      ) : (
        <div className="empty-page">
          <div className="empty-icon">
            <Icon name="check" size={27} />
          </div>
          <h2>一切看起来很好</h2>
          <p>
            当前扫描没有发现需要处理的错误或警告。你可以继续管理配置或 Skills。
          </p>
          <button
            className="button button-primary"
            onClick={() => onNavigate("configs")}
          >
            打开配置中心
          </button>
        </div>
      )}
      {recoveryPreview && (
        <section className="restore-panel" aria-labelledby="recovery-title">
          <div className="editor-header">
            <div>
              <span className="eyebrow">处理方案</span>
              <strong id="recovery-title">{recoveryPreview.summary}</strong>
            </div>
            <button
              className="icon-button"
              aria-label="关闭恢复预览"
              onClick={() => setRecoveryPreview(undefined)}
            >
              <Icon name="close" />
            </button>
          </div>
          <p>
            {recoveryPreview.plan.confirmationRequired
              ? "这是一个可能改变配置或安装状态的操作。请先核对问题范围和资源路径。"
              : "这是安全的重新扫描或刷新操作，不会直接修改源文件。"}
          </p>
          {recoveryPreview.plan.resourcePath && (
            <code className="recovery-path">
              {recoveryPreview.plan.resourcePath}
            </code>
          )}
          <div className="editor-footer">
            <button
              className="button button-ghost"
              onClick={() => setRecoveryPreview(undefined)}
            >
              取消
            </button>
            <button
              className="button button-primary"
              disabled={recoveryBusy}
              onClick={() => void executeRecovery()}
            >
              {recoveryBusy
                ? "执行中…"
                : recoveryPreview.plan.confirmationRequired
                  ? "确认并处理"
                  : "执行处理方案"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function HistoryPage({
  history,
  onNavigate,
  onChanged,
  searchQuery,
}: {
  history: ConfigHistoryRecord[];
  onNavigate: (section: Section) => void;
  onChanged: () => void;
  searchQuery: string;
}) {
  const [selected, setSelected] = useState<ConfigHistoryRecord>();
  const [restorePreview, setRestorePreview] = useState<ConfigEditPreview>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleHistory = normalizedQuery
    ? history.filter((entry) =>
        [
          agentMeta[entry.agent].name,
          entry.path,
          entry.operationType,
          entry.scope,
          entry.result,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : history;
  async function previewRestore(entry: ConfigHistoryRecord) {
    setBusy(true);
    setMessage(undefined);
    try {
      setSelected(entry);
      setRestorePreview(await previewConfigRestore(entry.id));
    } catch {
      setMessage("无法生成恢复 Diff。请先重新扫描对应配置。");
    } finally {
      setBusy(false);
    }
  }
  async function confirmRestore() {
    if (!selected || !restorePreview || busy) return;
    setBusy(true);
    try {
      await restoreConfigHistory(selected.id, restorePreview.before.checksum);
      setMessage("配置已从历史备份恢复，并为恢复前内容创建了新备份。");
      setSelected(undefined);
      setRestorePreview(undefined);
      onChanged();
    } catch {
      setMessage("恢复失败：配置可能已被外部修改。重新扫描并检查最新 Diff。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <h1 className="sr-only">变更历史</h1>
      {message && (
        <div className="alert alert-warning" role="status">
          <Icon name="warning" />
          <span>{message}</span>
        </div>
      )}
      {visibleHistory.length ? (
        <div className="history-list">
          {visibleHistory.map((entry) => (
            <article className="history-row" key={entry.id}>
              <div
                className={`agent-avatar small ${agentMeta[entry.agent].tone}`}
              >
                {agentMeta[entry.agent].mark}
              </div>
              <div className="history-copy">
                <div>
                  <strong>
                    {entry.operationType === "rollback"
                      ? "恢复配置"
                      : "编辑配置"}
                  </strong>
                  <span className={`scope-pill ${entry.scope}`}>
                    {entry.scope === "global" ? "全局" : "工作空间"}
                  </span>
                </div>
                <span>{entry.path}</span>
                <small>
                  {new Date(
                    `${entry.createdAt.replace(" ", "T")}Z`,
                  ).toLocaleString("zh-CN")}{" "}
                  · {entry.result === "succeeded" ? "成功" : "失败"}
                </small>
              </div>
              <button
                className="button button-ghost"
                disabled={busy || entry.result !== "succeeded"}
                onClick={() => void previewRestore(entry)}
              >
                预览恢复
              </button>
            </article>
          ))}
        </div>
      ) : normalizedQuery ? (
        <div className="empty-page compact">
          <div className="empty-icon">
            <Icon name="search" size={27} />
          </div>
          <h2>没有匹配的变更记录</h2>
          <p>可以按 Agent 名称、配置路径或操作类型搜索。</p>
        </div>
      ) : (
        <div className="empty-page">
          <div className="empty-icon">
            <Icon name="history" size={27} />
          </div>
          <h2>还没有变更记录</h2>
          <p>完成第一次配置写入后，备份和恢复入口会显示在这里。</p>
          <button
            className="button button-primary"
            onClick={() => onNavigate("configs")}
          >
            打开配置中心
          </button>
        </div>
      )}
      {selected && restorePreview && (
        <section className="restore-panel" aria-labelledby="restore-title">
          <div className="editor-header">
            <div>
              <span className="eyebrow">恢复确认</span>
              <strong id="restore-title">
                恢复 {agentMeta[selected.agent].name} 配置
              </strong>
            </div>
            <button
              className="icon-button"
              aria-label="关闭恢复预览"
              onClick={() => {
                setSelected(undefined);
                setRestorePreview(undefined);
              }}
            >
              <Icon name="close" />
            </button>
          </div>
          <p>确认后会把当前文件再次备份，再原子替换为所选历史版本。</p>
          <pre>{restorePreview.diff || "所选备份与当前内容一致。"}</pre>
          <div className="editor-footer">
            <button
              className="button button-ghost"
              onClick={() => {
                setSelected(undefined);
                setRestorePreview(undefined);
              }}
            >
              取消
            </button>
            <button
              className="button button-primary"
              disabled={!restorePreview.changed || busy}
              onClick={() => void confirmRestore()}
            >
              {busy ? "恢复中…" : "确认恢复并备份"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="page">
      <h1 className="sr-only">设置</h1>
      <div className="settings-grid">
        <section className="surface-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">隐私与安全</p>
              <h2>本地优先</h2>
            </div>
            <Icon name="shield" size={24} />
          </div>
          <div className="setting-row">
            <div>
              <strong>敏感值遮罩</strong>
              <span>Token、密钥和密码在预览与诊断中自动隐藏</span>
            </div>
            <span className="setting-value">强制开启</span>
          </div>
          <div className="setting-row">
            <div>
              <strong>写入前备份</strong>
              <span>每次确认写入都会保留可回滚副本</span>
            </div>
            <span className="setting-value">强制开启</span>
          </div>
        </section>
        <section className="surface-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">扫描偏好</p>
              <h2>保持信息新鲜</h2>
            </div>
            <Icon name="refresh" size={24} />
          </div>
          <div className="setting-row">
            <div>
              <strong>启动时扫描</strong>
              <span>打开应用后读取三种 Agent 的全局配置</span>
            </div>
            <span className="setting-value">默认开启</span>
          </div>
          <div className="setting-row">
            <div>
              <strong>界面语言</strong>
              <span>中文（简体）</span>
            </div>
            <span className="setting-value">中文</span>
          </div>
        </section>
      </div>
    </div>
  );
}
