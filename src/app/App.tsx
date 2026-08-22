import { useEffect, useMemo, useState } from "react";

import {
  addWorkspace,
  getAppInfo,
  getClaudeGlobalConfig,
  getCodexGlobalConfig,
  getDiagnostics,
  getOpenCodeGlobalConfig,
  getSkillInventory,
  listWorkspaces,
  previewConfigEdit,
  readConfigSource,
  removeWorkspace,
  scanWorkspace,
  writeConfig,
  type ConfigDocument,
  type ConfigEditPreview,
  type InstalledSkill,
  type SkillInventory,
  type UnifiedDiagnostic,
  type WorkspaceRecord,
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

function statusLabel(status: ConfigDocument["status"] | undefined) {
  if (status === "ready") return "已同步";
  if (status === "missing") return "未找到";
  if (status === "invalid") return "需要修复";
  if (status === "unreadable") return "无法读取";
  return "扫描中";
}

export function App() {
  const [section, setSection] = useState<Section>("overview");
  const [runtimeVersion, setRuntimeVersion] = useState<string>();
  const [configs, setConfigs] = useState<ConfigDocument[]>([]);
  const [skills, setSkills] = useState<SkillInventory>();
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
  };
  useEffect(() => {
    scan();
  }, []);

  const selectedConfig = useMemo(
    () => configs.find((config) => config.agent === selectedAgent),
    [configs, selectedAgent],
  );
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
          <div className="brand-mark">A</div>
          <div>
            <strong>{APP_NAME}</strong>
            <span>本地 Agent 工作空间</span>
          </div>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-dot" />
          个人工作区
          <Icon name="arrow" size={14} />
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
      <main className="main-content" id="main-content" tabIndex={-1}>
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
              <span className="sr-only">搜索</span>
              <input placeholder="搜索配置、Skill…" />
            </label>
            <button
              className="button button-ghost"
              onClick={scan}
              disabled={loading}
            >
              <Icon name="refresh" size={16} />
              {loading ? "扫描中" : "重新扫描"}
            </button>
          </div>
        </header>
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
          />
        )}
        {section === "skills" && <SkillsCenter skills={skills} />}
        {section === "workspaces" && (
          <WorkspacesPage workspaces={workspaces} onChanged={scan} />
        )}
        {section === "diagnostics" && (
          <DiagnosticsPage diagnostics={diagnostics} onNavigate={setSection} />
        )}
        {section === "history" && (
          <EmptyPage
            icon="history"
            title="还没有变更记录"
            description="你确认写入的配置会在这里留下时间、范围和备份位置，随时可以回滚。"
            action="查看配置中心"
            onAction={() => setSection("configs")}
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
  return (
    <div className="page">
      <PageIntro
        eyebrow="工作台 / 总览"
        title="你的 Agent，都在这里。"
        description="集中查看本地配置与 Skills，明确知道每一次变更发生了什么。"
        action={
          <button
            className="button button-primary"
            onClick={() => onNavigate("configs")}
          >
            <Icon name="edit" size={16} />
            管理配置
          </button>
        }
      />
      <section className="topology-card" aria-labelledby="topology-title">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">连接拓扑</p>
            <h2 id="topology-title">一个中心，三个入口</h2>
          </div>
          <span className="live-indicator">
            <i />
            本地扫描已开启
          </span>
        </div>
        <div className="topology">
          <div className="topology-lines">
            <span />
            <span />
            <span />
          </div>
          <div className="hub-node">
            <div className="hub-orbit">A</div>
            <strong>AgentHub</strong>
            <small>统一配置中枢</small>
          </div>
          <div className="agent-nodes">
            {(["claude-code", "codex", "opencode"] as const).map((agent) => {
              const config = configs.find((item) => item.agent === agent);
              const meta = agentMeta[agent];
              return (
                <div className="agent-node" key={agent}>
                  <div className={`agent-avatar ${meta.tone}`}>{meta.mark}</div>
                  <div>
                    <strong>{meta.name}</strong>
                    <span
                      className={`status-text ${config?.status === "ready" ? "success" : "muted"}`}
                    >
                      <i />
                      {statusLabel(config?.status)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <div className="metric-grid">
        <Metric
          icon="sliders"
          label="配置已同步"
          value={`${readyCount}/3`}
          detail="Claude · Codex · OpenCode"
          tone="teal"
        />
        <Metric
          icon="spark"
          label="已发现 Skills"
          value={skillCount.toString()}
          detail="来自全局与工作空间"
          tone="violet"
        />
        <Metric
          icon="warning"
          label="待处理诊断"
          value={diagnosticCount.toString()}
          detail={diagnosticCount ? "建议尽快查看" : "当前没有异常"}
          tone={diagnosticCount ? "amber" : "teal"}
        />
      </div>
      <div className="overview-grid">
        <section className="surface-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">安全写入</p>
              <h2>每一次修改都可回退</h2>
            </div>
            <Icon name="shield" size={24} />
          </div>
          <ol className="safe-steps">
            <li className="done">
              <span>1</span>
              <div>
                <strong>扫描并遮罩</strong>
                <small>敏感值默认不会出现在界面里</small>
              </div>
              <Icon name="check" size={16} />
            </li>
            <li className="done">
              <span>2</span>
              <div>
                <strong>预览 Diff</strong>
                <small>先看清楚改了什么，再决定写入</small>
              </div>
              <Icon name="check" size={16} />
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>确认并备份</strong>
                <small>原文件会在写入前自动备份</small>
              </div>
            </li>
          </ol>
          <button className="text-button" onClick={() => onNavigate("configs")}>
            打开配置中心 <Icon name="arrow" size={15} />
          </button>
        </section>
        <section className="surface-card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">快速入口</p>
              <h2>接下来做什么？</h2>
            </div>
          </div>
          <div className="quick-actions">
            <button onClick={() => onNavigate("skills")}>
              <span className="quick-icon violet">
                <Icon name="spark" />
              </span>
              <span>
                <strong>盘点 Skills</strong>
                <small>查看来源和管理归属</small>
              </span>
              <Icon name="arrow" size={16} />
            </button>
            <button onClick={() => onNavigate("workspaces")}>
              <span className="quick-icon teal">
                <Icon name="folder" />
              </span>
              <span>
                <strong>添加工作空间</strong>
                <small>接入一个本地项目目录</small>
              </span>
              <Icon name="arrow" size={16} />
            </button>
            <button onClick={() => onNavigate("history")}>
              <span className="quick-icon amber">
                <Icon name="history" />
              </span>
              <span>
                <strong>查看变更历史</strong>
                <small>回顾备份和写入记录</small>
              </span>
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <Icon name={icon} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function ConfigCenter({
  configs,
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
}: {
  configs: ConfigDocument[];
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
}) {
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
            <span>3 个入口</span>
          </div>
          {(["claude-code", "codex", "opencode"] as const).map((agent) => {
            const config = configs.find((item) => item.agent === agent);
            const meta = agentMeta[agent];
            return (
              <button
                key={agent}
                className={`config-agent ${selectedAgent === agent ? "selected" : ""}`}
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
              <small>全局配置 · 只影响你的用户账户</small>
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
                    <h2>{agentMeta[selectedConfig.agent].name} 全局配置</h2>
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

function SkillsCenter({ skills }: { skills?: SkillInventory }) {
  const groups = useMemo(() => {
    const result = new Map<string, InstalledSkill[]>();
    skills?.skills.forEach((skill) => {
      const key = skill.agent;
      result.set(key, [...(result.get(key) ?? []), skill]);
    });
    return result;
  }, [skills]);
  return (
    <div className="page">
      <PageIntro
        eyebrow="工作台 / Skills"
        title="Skills，从哪里来一目了然。"
        description="统一盘点全局与工作空间里的 Skill，区分来源、作用域和管理归属。"
        action={
          <button className="button button-primary">
            <Icon name="plus" size={16} />
            添加来源
          </button>
        }
      />
      <div className="skill-toolbar">
        <div className="source-chips">
          <span className="chip active">
            全部 <b>{skills?.skills.length ?? 0}</b>
          </span>
          <span className="chip">本地目录</span>
          <span className="chip">Git 仓库</span>
          <span className="chip">Marketplace</span>
          <span className="chip">skills.sh</span>
        </div>
        <button className="button button-ghost">
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
        {skills && skills.skills.length > 0 ? (
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
            <p>添加本地目录、Git 仓库或标准 Marketplace 后，在这里统一查看。</p>
            <button className="button button-primary">
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
}: {
  workspaces: WorkspaceRecord[];
  onChanged: () => void;
}) {
  const [path, setPath] = useState("");
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function addAndScan() {
    if (!path.trim() || busy) return;
    setBusy(true);
    try {
      await addWorkspace(path.trim());
      await scanWorkspace(path.trim());
      setMessage("工作空间已添加并完成扫描。");
      setPath("");
      onChanged();
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
          <p className="inline-message" role="status">
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
        {workspaces.length ? (
          <div className="workspace-rows">
            {workspaces.map((workspace) => (
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
                      .then(onChanged)
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
}: {
  diagnostics: UnifiedDiagnostic[];
  onNavigate: (section: Section) => void;
}) {
  const actionable = diagnostics.filter((item) => item.severity !== "info");
  return (
    <div className="page">
      <PageIntro
        eyebrow="系统 / 诊断中心"
        title="问题要有下一步。"
        description="统一查看配置、来源和本地存储状态；每条诊断都附带影响范围与恢复建议。"
        action={
          <span className="privacy-inline">
            <Icon name="shield" size={15} />
            路径已做安全处理
          </span>
        }
      />
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
              <button
                className="button button-ghost"
                onClick={() => onNavigate(item.agent ? "configs" : "settings")}
              >
                查看
              </button>
            </article>
          ))}
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
    </div>
  );
}

function EmptyPage({
  icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  description: string;
  action: string;
  onAction?: () => void;
}) {
  return (
    <div className="page">
      <PageIntro eyebrow="工作台" title={title} description={description} />
      <div className="empty-page">
        <div className="empty-icon">
          <Icon name={icon} size={28} />
        </div>
        <h2>{title}</h2>
        <p>{description}</p>
        <button className="button button-primary" onClick={onAction}>
          <Icon name="plus" size={16} />
          {action}
        </button>
        <small>这是本地操作，不会依赖 GitHub Issues 或第三方数据库。</small>
      </div>
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
            <span className="toggle on" aria-label="敏感值遮罩已开启">
              <i />
            </span>
          </div>
          <div className="setting-row">
            <div>
              <strong>写入前备份</strong>
              <span>每次确认写入都会保留可回滚副本</span>
            </div>
            <span className="toggle on" aria-label="写入前备份已开启">
              <i />
            </span>
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
            <span className="toggle on" aria-label="启动时扫描已开启">
              <i />
            </span>
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
