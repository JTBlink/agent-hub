import { useEffect, useId, useMemo, useState } from "react";

import {
  addWorkspace,
  executeDiagnosticRecovery,
  getAppInfo,
  getClaudeGlobalConfig,
  getCodexGlobalConfig,
  getDiagnostics,
  getOpenCodeGlobalConfig,
  getSkillInventory,
  listConfigHistory,
  listWorkspaces,
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
  type SkillInventory,
  type UnifiedDiagnostic,
  type WorkspaceRecord,
  type WorkspaceScanResult,
} from "../lib/backend";
import { APP_NAME } from "../lib/app-meta";

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

const agentMeta = {
  "claude-code": { name: "Claude Code", tone: "violet", mark: "C" },
  codex: { name: "Codex", tone: "teal", mark: "X" },
  opencode: { name: "OpenCode", tone: "amber", mark: "O" },
} as const;

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
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [selectedAgent, setSelectedAgent] =
    useState<ConfigDocument["agent"]>("claude-code");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
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

function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
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
  const connectionState = (agent: ConfigDocument["agent"]) => {
    const status = configs.find((config) => config.agent === agent)?.status;
    if (status === "ready") return "ready";
    if (status === "invalid" || status === "unreadable") return "warning";
    return "idle";
  };
  const connected = readyCount === 3;
  const hasAttention = diagnosticCount > 0 || readyCount < 3;
  const healthLabel = connected && !diagnosticCount ? "运行良好" : "需要关注";
  const healthTone = connected && !diagnosticCount ? "healthy" : "attention";
  return (
    <div className="page overview-page">
      <section className="overview-hero" aria-labelledby="overview-title">
        <div className="overview-hero-copy">
          <div
            className={`health-badge ${healthTone}`}
            aria-label={`本机工作区：${healthLabel}`}
          >
            <i aria-hidden="true" />
            <span>{healthLabel}</span>
            <small>本机工作区</small>
          </div>
          <p className="eyebrow">工作台 / 总览</p>
          <h1 id="overview-title">让每个 Agent 都处在掌控中。</h1>
          <p className="overview-hero-description">
            这里汇总配置、Skills 与诊断状态。先看全局，再决定下一次安全写入。
          </p>
          <div className="overview-hero-actions">
            <button
              className="button button-primary"
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
          aria-label={`本机状态：${readyCount}/3 个 Agent 已连接，${skillCount} 个 Skills 已发现，${diagnosticCount} 项待处理诊断`}
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
            <span>/ 3 Agent 已连接</span>
          </div>
          <div className="snapshot-meter" aria-hidden="true">
            <i style={{ width: `${Math.round((readyCount / 3) * 100)}%` }} />
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
        <div className="topology">
          <svg
            className="topology-network"
            viewBox="0 0 650 200"
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
            <path className="network-rail" d="M170 32 C270 32 330 72 450 72" />
            <path className="network-rail" d="M170 100 H450" />
            <path
              className="network-rail"
              d="M170 168 C270 168 330 128 450 128"
            />
            <path
              className={`network-flow flow-top ${connectionState("claude-code")}`}
              d="M170 32 C270 32 330 72 450 72"
            />
            <path
              className={`network-flow flow-mid ${connectionState("codex")}`}
              d="M170 100 H450"
            />
            <path
              className={`network-flow flow-bottom ${connectionState("opencode")}`}
              d="M170 168 C270 168 330 128 450 128"
            />
            <circle
              className={`network-pulse pulse-top ${connectionState("claude-code")}`}
              cx="450"
              cy="72"
              r="5"
            />
            <circle
              className={`network-pulse pulse-mid ${connectionState("codex")}`}
              cx="450"
              cy="100"
              r="5"
            />
            <circle
              className={`network-pulse pulse-bottom ${connectionState("opencode")}`}
              cx="450"
              cy="128"
              r="5"
            />
          </svg>
          <div className="agent-nodes">
            {(["claude-code", "codex", "opencode"] as const).map((agent) => {
              const config = configs.find((item) => item.agent === agent);
              const meta = agentMeta[agent];
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
            {readyCount}/3 个 Agent 正在为本地工作区提供配置
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
            <span className={`health-score ${healthTone}`}>{readyCount}/3</span>
          </div>
          <p className="health-panel-copy">
            {connected && !diagnosticCount
              ? "三个 Agent 都已读取到有效配置，写入仍会经过 Diff 与备份。"
              : "有配置或诊断需要确认，建议先处理后再进行批量写入。"}
          </p>
          <div className="health-list">
            <button onClick={() => onNavigate("configs")}>
              <span className="health-list-icon teal">
                <Icon name="sliders" />
              </span>
              <span>
                <strong>配置同步</strong>
                <small>{readyCount}/3 个 Agent 已准备好</small>
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

function ConfigCenter({
  configs,
  workspaceConfigs,
  selectedScope,
  setSelectedScope,
  selectedAgent,
  setSelectedAgent,
  selectedConfig,
  editing,
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
  return (
    <div className="page">
      <PageIntro
        eyebrow="工作台 / 配置中心"
        title="配置，清楚地放在眼前。"
        description="默认只读和遮罩。进入编辑模式后，AgentHub 会先生成 Diff，再写入并保留备份。"
        action={
          <span className="privacy-inline">
            <Icon name="shield" size={15} />
            敏感值已遮罩
          </span>
        }
      />
      <div className="config-layout">
        <aside className="config-sidebar">
          <div className="config-side-heading">
            <strong>Agent 配置</strong>
            <span>{selectedScope === "global" ? "全局" : "工作空间"}</span>
          </div>
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
          <div className="scope-note">
            <Icon name="file" size={16} />
            <span>
              <strong>当前作用域</strong>
              <small>
                {selectedScope === "global"
                  ? "全局配置 · 只影响你的用户账户"
                  : "工作空间配置 · 只影响当前项目"}
              </small>
            </span>
          </div>
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
              {!editing ? (
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
                      加载原文并编辑
                    </button>
                    <span>编辑前会再次确认文件校验和</span>
                  </div>
                </div>
              ) : (
                <div className="editor-block">
                  <div className="editor-header">
                    <div>
                      <span className="eyebrow">编辑模式</span>
                      <strong>只在本次会话中读取原文</strong>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="关闭编辑模式"
                      onClick={onCancel}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
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
                  <div className="editor-footer">
                    <span className="editor-hint">
                      原始内容 {source.length.toLocaleString()} 字符
                    </span>
                    <div>
                      <button
                        className="button button-ghost"
                        onClick={onCancel}
                      >
                        取消
                      </button>
                      <button
                        className="button button-secondary"
                        onClick={onPreview}
                      >
                        <Icon name="check" size={16} />
                        生成 Diff
                      </button>
                    </div>
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
                      <button
                        className="button button-primary"
                        disabled={!preview.changed || saving}
                        onClick={onSave}
                      >
                        {saving ? "保存中…" : "确认写入并备份"}
                      </button>
                    </div>
                  )}
                  {saveMessage && (
                    <p className="inline-message" role="status">
                      {saveMessage}
                    </p>
                  )}
                </div>
              )}
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
              <p>点击右上角“重新扫描”，AgentHub 会从本地读取配置状态。</p>
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
}: {
  skills?: SkillInventory;
  searchQuery: string;
  onScan: () => void;
  onNavigate: (section: Section) => void;
}) {
  const [filter, setFilter] = useState<
    "all" | "global" | "workspace" | "managed" | "external"
  >("all");
  const [showSourceGuide, setShowSourceGuide] = useState(false);
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
  const filters = [
    ["all", "全部"],
    ["global", "全局"],
    ["workspace", "工作空间"],
    ["managed", "AgentHub 管理"],
    ["external", "外部管理"],
  ] as const;
  return (
    <div className="page">
      <PageIntro
        eyebrow="工作台 / Skills"
        title="Skills，从哪里来一目了然。"
        description="统一盘点全局与工作空间里的 Skill，区分来源、作用域和管理归属。"
        action={
          <button
            className="button button-primary"
            aria-expanded={showSourceGuide}
            aria-controls="source-guide"
            onClick={() => setShowSourceGuide((visible) => !visible)}
          >
            <Icon name="plus" size={16} />
            添加来源
          </button>
        }
      />
      {showSourceGuide && (
        <section
          className="source-guide"
          id="source-guide"
          aria-labelledby="source-guide-title"
        >
          <div>
            <p className="eyebrow">添加来源</p>
            <h2 id="source-guide-title">先从本地工作空间开始</h2>
            <p>
              登记项目目录后会自动发现其中的
              Skills。Git、自定义仓库、Marketplace 与 skills.sh
              来源将在来源管理流程中统一安装和更新。
            </p>
          </div>
          <div className="source-guide-actions">
            <button
              className="button button-primary"
              onClick={() => onNavigate("workspaces")}
            >
              <Icon name="folder" size={16} />
              添加本地目录
            </button>
            <button
              className="button button-ghost"
              onClick={() => setShowSourceGuide(false)}
            >
              稍后处理
            </button>
          </div>
        </section>
      )}
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
        <button className="button button-ghost" onClick={onScan}>
          <Icon name="refresh" size={16} />
          扫描 Skills
        </button>
      </div>
      {skills?.duplicateNames.length ? (
        <div className="alert alert-warning" role="status">
          <Icon name="warning" />
          <span>
            发现同名 Skill：{skills.duplicateNames.join("、")}
            。请确认优先级后再启用。
          </span>
        </div>
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
                    <span>{skill.relativePath}</span>
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
      <PageIntro
        eyebrow="工作台 / 工作空间"
        title="把项目放进自己的上下文。"
        description="登记本地目录后，AgentHub 会扫描配置、AGENTS.md 与 Skills；移除记录不会触碰磁盘文件。"
      />
      <section className="workspace-add surface-card">
        <div>
          <p className="eyebrow">添加本地目录</p>
          <h2>接入一个工作空间</h2>
        </div>
        <div className="workspace-form">
          <label htmlFor="workspace-path">目录路径</label>
          <div>
            <input
              id="workspace-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="例如 /Users/me/projects/demo"
            />
            <button
              className="button button-primary"
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
  onRepair,
  searchQuery,
}: {
  diagnostics: UnifiedDiagnostic[];
  onNavigate: (section: Section) => void;
  onRepair: () => void;
  searchQuery: string;
}) {
  const [recoveryPreview, setRecoveryPreview] =
    useState<DiagnosticRecoveryPreview>();
  const [recoveryMessage, setRecoveryMessage] = useState<string>();
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const actionable = diagnostics.filter((item) => {
    if (item.severity === "info") return false;
    return (
      !normalizedQuery ||
      [item.code, item.impact, item.nextAction, item.resourcePath ?? ""]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery)
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
      <PageIntro
        eyebrow="系统 / 诊断中心"
        title="问题要有下一步。"
        description="统一查看配置、来源和本地存储状态；每条诊断都附带影响范围与恢复建议。"
        action={
          <button className="button button-ghost" onClick={onRepair}>
            <Icon name="refresh" size={15} />
            执行安全重扫
          </button>
        }
      />
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
                  <strong>{item.code}</strong>
                  <span className="diagnostic-severity">
                    {item.severity === "error" ? "错误" : "警告"}
                  </span>
                </div>
                <p>{item.impact}</p>
                <small>下一步：{item.nextAction}</small>
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
                      预览修复
                    </button>
                  )}
                <button
                  className="button button-ghost"
                  onClick={() =>
                    onNavigate(
                      item.agent
                        ? "configs"
                        : item.code.startsWith("skill:")
                          ? "skills"
                          : "settings",
                    )
                  }
                >
                  查看详情
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
              <span className="eyebrow">恢复预览</span>
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
              ? "此操作需要明确确认。执行前请核对诊断范围和资源路径。"
              : "这是安全操作；执行后 AgentHub 会立即重新扫描。"}
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
                  ? "确认并执行"
                  : "执行安全修复"}
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
      <PageIntro
        eyebrow="工作台 / 变更历史"
        title="每一次写入，都留有退路。"
        description="这里只保存非敏感元数据和备份位置；恢复前仍会生成遮罩 Diff 并要求明确确认。"
      />
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
      <PageIntro
        eyebrow="系统 / 设置"
        title="让 AgentHub 按你的习惯工作。"
        description="隐私、扫描和显示偏好都保存在本机。"
      />
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
