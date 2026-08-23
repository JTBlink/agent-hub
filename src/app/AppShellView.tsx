import { useEffect, useId, useMemo, useRef, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ConfirmModal, Modal, useConfirm } from "./Modal";

import {
  addWorkspace,
  applySkillInstall,
  browseSkillSource,
  clearUserData,
  executeDiagnosticRecovery,
  getAppInfo,
  getClaudeGlobalConfig,
  getCodexGlobalConfig,
  getDiagnostics,
  getOpenCodeGlobalConfig,
  getSkillInventory,
  getUserDataPaths,
  listConfigHistory,
  listWorkspaces,
  planSkillInstall,
  previewConfigEdit,
  previewConfigRestore,
  previewDiagnosticRecovery,
  readConfigSource,
  readSkillSource,
  resolveLegacyCodexSkill,
  removeWorkspace,
  scanWorkspace,
  restoreConfigHistory,
  writeConfig,
  type ConfigDocument,
  type ConfigEditPreview,
  type ConfigHistoryRecord,
  type DiagnosticRecoveryPreview,
  type InstructionFile,
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
  openExternalSkillSource,
  sourceBrowserUrl,
  sourceInputBrowserUrl,
} from "../lib/external-skill-links";
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
  diagnosticRealSkillPath,
  diagnosticSubject,
  matchingSkillsForDiagnostic,
} from "../lib/diagnostic-presentation";
import {
  compactUserPath,
  diagnosticRecoveryPresentation,
} from "../lib/diagnostic-recovery-presentation";
import {
  failedLegacyActionFeedback,
  legacyActionConfirmOptions,
  preferredCodexSkillDirectory,
  successfulLegacyActionFeedback,
  type LegacySkillFeedback,
} from "../lib/legacy-codex-skill";
import { createTopologyLayout } from "../lib/topology";
import {
  buildSkillSourceRequest,
  type SkillSourceMode,
} from "../lib/skill-source-flow";
import {
  currentSkillVersion,
  isSkillUpdateSupported,
} from "../lib/skill-update-flow";
import {
  selectMarketplaceManifest,
  selectSkillSourceDirectory,
  selectWorkspaceDirectory,
} from "../lib/workspace-dialog";
import {
  DuplicateSkillsPage,
  type DuplicateSkillGroup,
} from "./DuplicateSkillsPage";
import { DeepLinkInstallPanel } from "./DeepLinkInstallPanel";
import { DiagnosticRecoveryPage } from "./DiagnosticRecoveryPage";
import { ExternalSkillsPage } from "./ExternalSkillsPage";
import { AgentSkillSwitcher } from "./AgentSkillSwitcher";
import { PageNavigation } from "./PageNavigation";
import { SubTabs } from "./SubTabs";
import {
  listenForDeepLinkInstall,
  listenForDeepLinkError,
  type DeepLinkInstallRequest,
} from "../lib/deep-link";

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
  | "close"
  | "link";

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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function openExternalSource(url: string) {
  void openExternalSkillSource(url).catch(() => {
    window.alert("无法打开系统浏览器，请检查系统默认浏览器设置。");
  });
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
    link: (
      <>
        <path d="m9 15 6-6" />
        <path d="M7.5 17.5 6 19a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0" />
        <path d="m16.5 6.5 1.5-1.5a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0" />
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

function instructionKindLabel(kind: InstructionFile["kind"]) {
  if (kind === "agents") return "Agent 指令";
  if (kind === "claude") return "Claude 指令";
  return "指令文件";
}

function instructionFileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function isCodexSystemSkillPath(path: string) {
  return /[\\/]\.codex[\\/]skills[\\/]\.system(?:[\\/]|$)/.test(path);
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
  const [workspaceInstructions, setWorkspaceInstructions] = useState<
    InstructionFile[]
  >([]);
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
  const [deepLinkRequest, setDeepLinkRequest] =
    useState<DeepLinkInstallRequest>();
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

  useEffect(() => {
    const unsubscribers = [
      listenForDeepLinkInstall((req) => {
        setDeepLinkRequest(req);
        setSection("skills");
      }),
      listenForDeepLinkError((msg) => {
        setError(`Deep link 错误: ${msg}`);
      }),
    ];
    return () => {
      unsubscribers.forEach((p) => void p.then((unsub) => unsub()));
    };
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
            workspaceInstructions={workspaceInstructions}
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
        {section === "skills" && deepLinkRequest && (
          <DeepLinkInstallPanel
            request={deepLinkRequest}
            onDismiss={() => setDeepLinkRequest(undefined)}
            onInstalled={() => {
              setDeepLinkRequest(undefined);
              refreshSkillInventory();
            }}
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
          />
        )}
        {section === "workspaces" && (
          <WorkspacesPage
            workspaces={workspaces}
            onChanged={scan}
            searchQuery={searchQuery}
            onScanned={(result) => {
              setWorkspaceConfigs(result.configs);
              setWorkspaceInstructions(result.instructions);
              setSelectedScope("workspace");
              setSection("configs");
            }}
          />
        )}
        {section === "diagnostics" && (
          <DiagnosticsPage
            diagnostics={diagnostics}
            skills={skills}
            diagnosticFocus={skillDiagnosticFocus}
            onDismissDiagnostic={() => setSkillDiagnosticFocus(undefined)}
            onNavigate={setSection}
            onViewSkillDetails={(item) => {
              setSkillDiagnosticFocus(item);
              setSearchQuery("");
              setSection("diagnostics");
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
            <p className="eyebrow">工作台 / 总览</p>
            <span
              className={`overview-status ${healthTone}`}
              aria-label={`本机工作区：${healthLabel}`}
            >
              <i aria-hidden="true" />
              {healthLabel}
            </span>
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
          </div>
          <div className="topology-meta">
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
  workspaceInstructions,
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
  workspaceInstructions: InstructionFile[];
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
  const visibleInstructions =
    selectedScope === "workspace"
      ? workspaceInstructions.filter((instruction) => {
          if (!normalizedQuery) return true;
          return [
            instruction.path,
            instruction.kind,
            instructionKindLabel(instruction.kind),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedQuery);
        })
      : [];

  if (editing && selectedConfig) {
    const meta = agentMeta[selectedConfig.agent];
    return (
      <div className="page config-edit-page">
        <PageNavigation
          backLabel="返回配置中心"
          onBack={onCancel}
          leading={
            <div className={`agent-avatar small ${meta.tone}`}>{meta.mark}</div>
          }
          title={`${meta.name} ${
            selectedConfig.scope === "global" ? "全局" : "工作空间"
          }配置`}
          actions={
            <button className="button button-secondary" onClick={onPreview}>
              <Icon name="check" size={16} />
              生成 Diff
            </button>
          }
        />
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
              disabled={!workspaceConfigs.length && !workspaceInstructions.length}
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
              {selectedScope === "workspace" && (
                <InstructionFilesPanel
                  instructions={visibleInstructions}
                  total={workspaceInstructions.length}
                  searchQuery={normalizedQuery}
                />
              )}
            </>
          ) : normalizedQuery ? (
            <>
              {selectedScope === "workspace" && (
                <InstructionFilesPanel
                  instructions={visibleInstructions}
                  total={workspaceInstructions.length}
                  searchQuery={normalizedQuery}
                />
              )}
              <div className="empty-state large">
                <div className="empty-icon">
                  <Icon name="search" size={24} />
                </div>
                <h2>没有匹配的配置</h2>
                <p>试试搜索 Agent 名称、文件路径或状态，例如“Codex”。</p>
              </div>
            </>
          ) : (
            <>
              {selectedScope === "workspace" && (
                <InstructionFilesPanel
                  instructions={visibleInstructions}
                  total={workspaceInstructions.length}
                  searchQuery={normalizedQuery}
                />
              )}
              <div className="empty-state large">
                <div className="empty-icon">
                  <Icon name="file" size={24} />
                </div>
                <h2>还没有扫描结果</h2>
                <p>点击右上角"重新扫描"，AgentHub 会从本地读取配置状态。</p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function InstructionFilesPanel({
  instructions,
  total,
  searchQuery,
}: {
  instructions: InstructionFile[];
  total: number;
  searchQuery: string;
}) {
  return (
    <section className="instruction-files-panel" aria-labelledby="instruction-files-title">
      <div className="instruction-files-heading">
        <div>
          <p className="eyebrow">工作空间上下文</p>
          <h3 id="instruction-files-title">指令文件</h3>
        </div>
        <span className="instruction-files-count">
          {searchQuery ? `${instructions.length} / ${total}` : total} 个
        </span>
      </div>
      {instructions.length ? (
        <div className="instruction-files-list">
          {instructions.map((instruction) => (
            <article className="instruction-file-row" key={instruction.path}>
              <div className="instruction-file-icon">
                <Icon name="file" size={16} />
              </div>
              <div className="instruction-file-copy">
                <strong>{instructionFileName(instruction.path)}</strong>
                <span>
                  {instructionKindLabel(instruction.kind)} · 工作空间
                </span>
                <code title={instruction.path}>{instruction.path}</code>
              </div>
              <span className="instruction-readonly">只读发现</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="instruction-files-empty">
          {searchQuery
            ? "没有匹配的指令文件。"
            : "当前工作空间没有发现 AGENTS.md 或 CLAUDE.md。"}
        </p>
      )}
    </section>
  );
}

function SkillsCenter({
  skills,
  searchQuery,
  onScan,
  onNavigate,
  workspaces,
  onInstalled,
}: {
  skills?: SkillInventory;
  searchQuery: string;
  onScan: () => void;
  onNavigate: (section: Section) => void;
  workspaces: WorkspaceRecord[];
  onInstalled: (workspaceDirectory?: string) => void;
}) {
  const [view, setView] = useState<"installed" | "marketplace">("installed");
  const [selectedAgent, setSelectedAgent] =
    useState<InstalledSkill["agent"]>("codex");
  const agentOptions = useMemo(
    () =>
      defaultAgentIds.map((agentId) => {
        const meta = getAgentMeta(agentId);
        return {
          id: agentId as InstalledSkill["agent"],
          ...meta,
          count: (skills?.skills ?? []).filter(
            (skill) => skill.agent === agentId,
          ).length,
        };
      }),
    [skills],
  );
  const [filter, setFilter] = useState<
    "all" | "global" | "workspace" | "managed" | "external" | "storage"
  >("all");
  const [showSourcePage, setShowSourcePage] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [legacyActionPath, setLegacyActionPath] = useState<string>();
  const [legacyAction, setLegacyAction] = useState<"migrate" | "archive">();
  const [legacyFeedback, setLegacyFeedback] = useState<LegacySkillFeedback>();
  const [skillViewer, setSkillViewer] = useState<SkillViewerState>();
  const [updateTarget, setUpdateTarget] = useState<InstalledSkill>();
  const { confirm, ConfirmPortal } = useConfirm();
  const skillsScrollPosition = useRef({ main: 0, window: 0 });
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
          skill.agent === selectedAgent &&
          matchesFilter &&
          (!normalizedQuery || haystack.includes(normalizedQuery))
        );
      }),
    [filter, normalizedQuery, selectedAgent, skills],
  );
  const groups = useMemo(() => {
    const result = new Map<string, InstalledSkill[]>();
    filteredSkills.forEach((skill) => {
      const key = skill.agent;
      result.set(key, [...(result.get(key) ?? []), skill]);
    });
    return result;
  }, [filteredSkills]);
  const duplicateGroups = useMemo(() => {
    const result: DuplicateSkillGroup[] = [];
    for (const name of skills?.duplicateNames ?? []) {
      const matches = (skills?.skills ?? []).filter(
        (skill) => skill.name === name || skill.displayName === name,
      );
      for (const agent of defaultAgentIds) {
        for (const scope of ["global", "workspace"] as const) {
          const scoped = matches.filter(
            (skill) => skill.agent === agent && skill.scope === scope,
          );
          if (scoped.length > 1) {
            const meta = getAgentMeta(agent);
            result.push({
              name,
              agent,
              agentName: meta.name,
              agentMark: meta.mark,
              agentTone: meta.tone,
              scope,
              matches: scoped,
            });
          }
        }
      }
    }
    return result;
  }, [skills]);
  const filters = [
    ["all", "全部"],
    ["global", "全局"],
    ["workspace", "工作空间"],
    ["managed", "AgentHub 管理"],
    ["external", "外部管理"],
    ["storage", "安装信息"],
  ] as const;
  async function handleViewSkill(skill: InstalledSkill) {
    setSkillViewer({ skill, loading: true });
    try {
      const content = await readSkillSource(skill.path);
      setSkillViewer((current) =>
        current?.skill.path === skill.path
          ? { skill, content, loading: false }
          : current,
      );
    } catch (error) {
      setSkillViewer((current) =>
        current?.skill.path === skill.path
          ? {
              skill,
              loading: false,
              error:
                error instanceof Error
                  ? error.message
                  : typeof error === "string" && error.trim()
                    ? error
                    : "无法读取该 Skill 的 SKILL.md。",
            }
          : current,
      );
    }
  }
  useEffect(() => {
    if (!showDuplicates) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("duplicate-page-title")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showDuplicates]);
  useEffect(() => {
    if (!showSourcePage) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("source-page-heading")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showSourcePage]);
  if (showSourcePage) {
    return (
      <div className="page">
        <h1 id="source-page-heading" className="sr-only" tabIndex={-1}>
          添加 Skill 来源
        </h1>
        <SkillSourcePanel
          id="source-page"
          workspaces={workspaces}
          onNavigate={onNavigate}
          onBack={() => setShowSourcePage(false)}
          onInstalled={onInstalled}
          installedSkills={skills?.skills ?? []}
          searchQuery={searchQuery}
          updateSkill={updateTarget}
          onClearUpdate={() => setUpdateTarget(undefined)}
        />
      </div>
    );
  }
  if (view === "marketplace") {
    return (
      <ExternalSkillsPage
        viewTabs={
          <SkillsViewTabs
            view={view}
            installedCount={skills?.skills.length ?? 0}
            onChange={setView}
          />
        }
        localRoots={skills?.roots ?? []}
        renderIcon={(name, size) => <Icon name={name} size={size} />}
      />
    );
  }
  async function handleLegacyAction(
    sourcePath: string,
    action: "migrate" | "archive",
  ) {
    if (legacyActionPath) return;
    const opts = legacyActionConfirmOptions(sourcePath, action);
    const ok = await confirm({
      tone: "neutral",
      title: opts.title,
      description: (
        <>
          <div className="modal-paths">
            {opts.paths.map((p) => (
              <code key={p}>{p}</code>
            ))}
          </div>
          <p>{opts.note}</p>
        </>
      ),
      confirmLabel: action === "migrate" ? "确认迁移" : "确认归档",
    });
    if (!ok) return;
    setLegacyActionPath(sourcePath);
    setLegacyAction(action);
    setLegacyFeedback(undefined);
    try {
      const result = await resolveLegacyCodexSkill({ sourcePath, action });
      setLegacyFeedback(successfulLegacyActionFeedback(result));
      onInstalled();
    } catch (error) {
      setLegacyFeedback(failedLegacyActionFeedback(error));
    } finally {
      setLegacyActionPath(undefined);
      setLegacyAction(undefined);
    }
  }
  function openDuplicatePage() {
    const main = document.querySelector<HTMLElement>(".main-content");
    skillsScrollPosition.current = {
      main: main?.scrollTop ?? 0,
      window: window.scrollY,
    };
    setShowDuplicates(true);
    window.requestAnimationFrame(() => {
      main?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    });
  }
  function closeDuplicatePage() {
    const main = document.querySelector<HTMLElement>(".main-content");
    setShowDuplicates(false);
    window.requestAnimationFrame(() => {
      main?.scrollTo({ top: skillsScrollPosition.current.main });
      window.scrollTo({ top: skillsScrollPosition.current.window });
      document
        .querySelector<HTMLButtonElement>('[data-duplicate-trigger="true"]')
        ?.focus();
    });
  }
  if (showDuplicates) {
    return (
      <>
        {ConfirmPortal}
        <DuplicateSkillsPage
          groups={duplicateGroups}
          feedback={
            legacyFeedback ? (
              <Modal
                open
                onClose={() => setLegacyFeedback(undefined)}
                tone={legacyFeedback.tone === "error" ? "error" : "success"}
                title={legacyFeedback.title}
                icon={
                  <Icon
                    name={legacyFeedback.tone === "error" ? "warning" : "check"}
                    size={20}
                  />
                }
                actions={
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => setLegacyFeedback(undefined)}
                  >
                    关闭结果
                  </button>
                }
              >
                <p>{legacyFeedback.summary}</p>
                {(legacyFeedback.originalPath ||
                  legacyFeedback.destinationPath ||
                  legacyFeedback.backupPath) && (
                  <div className="modal-paths">
                    {legacyFeedback.originalPath && (
                      <code>原位置：{legacyFeedback.originalPath}</code>
                    )}
                    {legacyFeedback.destinationPath && (
                      <code>
                        {legacyFeedback.destinationLabel ?? "目标位置"}：
                        {legacyFeedback.destinationPath}
                      </code>
                    )}
                    {legacyFeedback.backupPath &&
                      legacyFeedback.backupPath !==
                        legacyFeedback.destinationPath && (
                        <code>备份位置：{legacyFeedback.backupPath}</code>
                      )}
                  </div>
                )}
              </Modal>
            ) : undefined
          }
          warningIcon={<Icon name="warning" size={18} />}
          resolvedIcon={<Icon name="check" size={24} />}
          busyPath={legacyActionPath}
          busyAction={legacyAction}
          onBack={closeDuplicatePage}
          onArchive={(path) => void handleLegacyAction(path, "archive")}
          renderLocation={(skill) => (
            <SkillLocation
              key={`${skill.agent}-${skill.scope}-${skill.path}`}
              skill={skill}
            />
          )}
        />
      </>
    );
  }
  return (
    <div className="page">
      {ConfirmPortal}
      <h1 className="sr-only">Skills</h1>
      <SkillsViewTabs
        view={view}
        installedCount={skills?.skills.length ?? 0}
        onChange={setView}
      />
      {legacyFeedback && (
        <Modal
          open
          onClose={() => setLegacyFeedback(undefined)}
          tone={legacyFeedback.tone === "error" ? "error" : "success"}
          title={legacyFeedback.title}
          icon={
            <Icon
              name={legacyFeedback.tone === "error" ? "warning" : "check"}
              size={20}
            />
          }
          actions={
            <button
              className="button button-primary"
              type="button"
              onClick={() => setLegacyFeedback(undefined)}
            >
              关闭结果
            </button>
          }
        >
          <p>{legacyFeedback.summary}</p>
          {(legacyFeedback.originalPath ||
            legacyFeedback.destinationPath ||
            legacyFeedback.backupPath) && (
            <div className="modal-paths">
              {legacyFeedback.originalPath && (
                <code>原位置：{legacyFeedback.originalPath}</code>
              )}
              {legacyFeedback.destinationPath && (
                <code>
                  {legacyFeedback.destinationLabel ?? "目标位置"}：
                  {legacyFeedback.destinationPath}
                </code>
              )}
              {legacyFeedback.backupPath &&
                legacyFeedback.backupPath !==
                  legacyFeedback.destinationPath && (
                  <code>备份位置：{legacyFeedback.backupPath}</code>
                )}
            </div>
          )}
        </Modal>
      )}
      {skillViewer && (
        <Modal
          open
          onClose={() => setSkillViewer(undefined)}
          title={`${skillViewer.skill.displayName} · SKILL.md`}
          width="min(760px, calc(100vw - 32px))"
          actions={
            <button
              className="button button-primary"
              type="button"
              onClick={() => setSkillViewer(undefined)}
            >
              关闭
            </button>
          }
        >
          <div className="skill-viewer-meta">
            <span className="eyebrow">
              {isSystemSkill(skillViewer.skill) ? "Codex 系统 Skill" : "只读查看"}
            </span>
            <code title={skillViewer.skill.path}>{skillViewer.skill.path}</code>
          </div>
          {skillViewer.loading ? (
            <div className="skill-viewer-loading">正在读取 SKILL.md…</div>
          ) : skillViewer.error ? (
            <p className="skill-viewer-error" role="alert">
              {skillViewer.error}
            </p>
          ) : (
            <pre className="skill-viewer-content">{skillViewer.content}</pre>
          )}
        </Modal>
      )}
      <AgentSkillSwitcher
        options={agentOptions}
        selectedAgent={selectedAgent}
        onChange={(agent) => {
          setSelectedAgent(agent);
          setUpdateTarget(undefined);
        }}
      />
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
            onClick={() => setShowSourcePage(true)}
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
      {filter === "storage" ? (
        <SkillStorageSummary roots={skills?.roots ?? []} />
      ) : (
        <>
          {duplicateGroups.length ? (
            <div className="alert alert-warning" role="status">
              <Icon name="warning" />
              <span>
                发现 {duplicateGroups.length} 组同 Agent 重复 Skill：
                {duplicateGroups
                  .map((group) => `${group.agent} · ${group.name}`)
                  .join("、")}
                。跨 Agent 共用同一路径属于正常安装，不计入冲突。
              </span>
              <button
                type="button"
                data-duplicate-trigger="true"
                onClick={openDuplicatePage}
              >
                查看重复项
              </button>
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
                        <span>
                          {skill.relativePath} ·{" "}
                          {skill.compatibility ?? "通用兼容"}
                        </span>
                        <small>
                          {skillSourceLabel(skill.source.kind)} ·{" "}
                          {skill.enabled ? "已启用" : "已停用"}
                        </small>
                        <small className="skill-version">
                          当前版本：{currentSkillVersion(skill)}
                        </small>
                        <code className="skill-path" title={skill.path}>
                          安装路径：{skill.path}
                        </code>
                        {isSystemSkill(skill) && (
                          <span className="skill-system-pill">
                            系统 Skill · Codex 管理
                          </span>
                        )}
                        {skill.storageKind === "symlink" && (
                          <>
                            <span className="skill-storage-kind symlink">
                              软链接
                              <Icon name="link" size={12} />
                            </span>
                            <code
                              className="skill-path skill-real-path"
                              title={skill.realPath}
                            >
                              真实路径：{skill.realPath}
                            </code>
                          </>
                        )}
                      </div>
                      <span className={`scope-pill ${skill.scope}`}>
                        {skill.scope === "global" ? "全局" : "工作空间"}
                      </span>
                      <span className="managed-pill">
                        {skill.sourceTracked ? "AgentHub 管理" : "外部管理"}
                      </span>
                      {isSkillUpdateSupported(skill) && (
                        <button
                          className="button button-ghost skill-update-button"
                          type="button"
                          onClick={() => {
                            setUpdateTarget(skill);
                            setShowSourcePage(true);
                          }}
                        >
                          <Icon name="refresh" size={13} />
                          更新
                        </button>
                      )}
                      <button
                        className="button button-ghost skill-view-button"
                        type="button"
                        onClick={() => void handleViewSkill(skill)}
                      >
                        <Icon name="file" size={13} />
                        查看
                      </button>
                    </article>
                  ))}
                </section>
              ))
            ) : (
              <div className="empty-state large">
                <div className="empty-icon">
                  <Icon name="spark" size={24} />
                </div>
                <h2>
                  {(skills?.skills.length ?? 0) > 0
                    ? `${getAgentMeta(selectedAgent).name} 暂无匹配的 Skill`
                    : "还没有发现 Skill"}
                </h2>
                <p>
                  {(skills?.skills.length ?? 0) > 0 ||
                  normalizedQuery ||
                  filter !== "all"
                    ? "没有符合当前搜索或筛选条件的 Skill。"
                    : "添加本地目录、Git 仓库或标准 Marketplace 后，在这里统一查看。"}
                </p>
                <button
                  className="button button-primary"
                  onClick={() => setShowSourcePage(true)}
                >
                  <Icon name="plus" size={16} />
                  添加第一个来源
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type SkillViewerState = {
  skill: InstalledSkill;
  content?: string;
  loading: boolean;
  error?: string;
};

function isSystemSkill(skill: InstalledSkill) {
  return ["/.codex/skills/.system/", "/.agents/skills/.system/"].some((marker) =>
    skill.path.includes(marker),
  );
}

function SkillStorageSummary({ roots }: { roots: SkillInventory["roots"] }) {
  return (
    <section
      className="skill-storage-summary"
      aria-labelledby="skill-storage-title"
    >
      <div>
        <p className="eyebrow">安装信息</p>
        <h2 id="skill-storage-title">安装目录与占用</h2>
        <p>按实际安装根目录统计 Skill 数量与磁盘占用，不包含符号链接。</p>
      </div>
      <div className="skill-storage-total">
        <span>总占用</span>
        <strong>
          {formatBytes(roots.reduce((total, root) => total + root.bytes, 0))}
        </strong>
      </div>
      <div className="skill-storage-roots">
        {roots.map((root) => (
          <div key={root.path}>
            <code title={root.path}>{root.path}</code>
            <span>
              {formatBytes(root.bytes)} · {root.skillCount} 个 Skill
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SkillsViewTabs({
  view,
  installedCount,
  onChange,
}: {
  view: "installed" | "marketplace";
  installedCount: number;
  onChange: (view: "installed" | "marketplace") => void;
}) {
  return (
    <SubTabs
      value={view}
      ariaLabel="Skills 视图"
      onChange={onChange}
      items={[
        {
          value: "installed",
          label: "已安装",
          badge: <span>{installedCount}</span>,
        },
        { value: "marketplace", label: "Marketplace" },
      ]}
    />
  );
}

function SkillLocation({ skill }: { skill: InstalledSkill }) {
  const isCodexLegacy =
    skill.agent === "codex" && skill.path.includes("/.codex/skills/");
  return (
    <div className="skill-location">
      <div>
        <strong>{getAgentMeta(skill.agent).name}</strong>
        <span>
          {skill.scope === "global" ? "全局" : "工作空间"} ·{" "}
          {skill.sourceTracked ? "AgentHub 管理" : "外部管理"}
          {isCodexLegacy ? " · Codex 兼容目录" : ""}
        </span>
        {skill.storageKind === "symlink" && (
          <span className="skill-storage-kind symlink">
            软链接
            <Icon name="link" size={12} />
          </span>
        )}
      </div>
      <div className="skill-location-paths">
        <code>安装路径：{skill.path}</code>
        {skill.storageKind === "symlink" && (
          <code>真实路径：{skill.realPath}</code>
        )}
      </div>
    </div>
  );
}

const presetSkillRepositories = [
  ["anthropics/skills", "Anthropic 官方"],
  ["mattpocock/skills", "Matt Pocock"],
  ["obra/superpowers", "Superpowers"],
  ["affaan-m/ECC", "Everything Claude Code"],
] as const;

function installedSkillsFor(
  skill: SkillSourceBrowseResult["skills"][number],
  installedSkills: InstalledSkill[],
) {
  const identities = [skill.name, skill.displayName]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLocaleLowerCase());
  return installedSkills.filter((installed) => {
    const sameIdentity = [installed.name, installed.displayName]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLocaleLowerCase())
      .some((value) => identities.includes(value));
    return (
      sameIdentity &&
      (!installed.sourceTracked ||
        installed.source.locator === skill.source.locator)
    );
  });
}

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
  onBack,
  onInstalled,
  installedSkills,
  searchQuery,
  updateSkill,
  onClearUpdate,
}: {
  id: string;
  workspaces: WorkspaceRecord[];
  onNavigate: (section: Section) => void;
  onBack?: () => void;
  onInstalled: (workspaceDirectory?: string) => void;
  installedSkills: InstalledSkill[];
  searchQuery: string;
  updateSkill?: InstalledSkill;
  onClearUpdate: () => void;
}) {
  const initialMode = updateSkill
    ? updateSkill.source.kind === "skills-sh"
      ? "skills-sh"
      : updateSkill.source.kind === "git" ||
          updateSkill.source.kind === "preset-git"
        ? "git"
        : updateSkill.source.kind
    : "skills-sh";
  const [mode, setMode] = useState<SkillSourceMode>(initialMode);
  const [locator, setLocator] = useState(
    updateSkill
      ? (updateSkill.source.manifestPath ?? updateSkill.source.locator)
      : "anthropics/skills",
  );
  const [requestedRef, setRequestedRef] = useState(
    updateSkill?.source.requestedRef ?? "",
  );
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
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<"uninstalled" | "all">(
    updateSkill ? "all" : "uninstalled",
  );

  useEffect(() => {
    if (!updateSkill) return;
    const source = updateSkill.source;
    const nextMode =
      source.kind === "skills-sh"
        ? "skills-sh"
        : source.kind === "git" || source.kind === "preset-git"
          ? "git"
          : source.kind;
    setMode(nextMode);
    setLocator(
      source.kind === "skills-sh"
        ? source.locator.replace(/^https:\/\/skills\.sh\//, "")
        : (source.manifestPath ?? source.locator),
    );
    setRequestedRef(source.requestedRef ?? "");
    setAgent(updateSkill.agent);
    setScope(updateSkill.scope);
    const workspace = workspaces.find((item) =>
      updateSkill.path.startsWith(item.normalizedPath),
    );
    setWorkspaceId(workspace?.id ?? "");
    setCatalogFilter("all");
    setBrowseResult(undefined);
    setPlan(undefined);
    setMessage(undefined);
  }, [updateSkill, workspaces]);

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
  const browserUrl = sourceInputBrowserUrl(mode, locator);
  const normalizedCatalogQuery = (catalogQuery || searchQuery)
    .trim()
    .toLocaleLowerCase();
  const visibleSourceSkills = useMemo(
    () =>
      (browseResult?.skills ?? []).filter((skill) => {
        const installed = installedSkillsFor(skill, installedSkills).length > 0;
        const matchesQuery =
          !normalizedCatalogQuery ||
          [
            skill.name ?? "",
            skill.displayName,
            skill.description ?? "",
            skill.relativePath,
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedCatalogQuery);
        return matchesQuery && (catalogFilter === "all" || !installed);
      }),
    [browseResult, catalogFilter, installedSkills, normalizedCatalogQuery],
  );
  const uninstalledCount = (browseResult?.skills ?? []).filter(
    (skill) => installedSkillsFor(skill, installedSkills).length === 0,
  ).length;

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
      const first =
        (updateSkill &&
          result.skills.find(
            (skill) =>
              (skill.name === updateSkill.name ||
                skill.displayName === updateSkill.displayName) &&
              skill.installable,
          )) ??
        result.skills.find(
          (skill) =>
            skill.installable &&
            installedSkillsFor(skill, installedSkills).length === 0,
        ) ??
        result.skills.find((skill) => skill.installable);
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
      setMessage(
        updateSkill
          ? "Skill 已更新，并已记录新的来源版本。"
          : "Skill 已安装，并已记录来源与版本。",
      );
      setPlan(undefined);
      onClearUpdate();
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
          <h2 id={`${id}-title`}>
            {updateSkill
              ? `更新 ${updateSkill.displayName}`
              : "发现 Skill，确认后安装"}
          </h2>
          <p>
            {updateSkill
              ? `当前版本 ${currentSkillVersion(updateSkill)}。重新读取来源后，确认新版本和文件清单再更新。`
              : "网页浏览不会下载内容；只有点击“检查并读取”后，AgentHub 才会获取来源并进入安全安装流程。"}
          </p>
        </div>
        <div className="source-guide-actions">
          {onBack && (
            <button className="button button-ghost" onClick={onBack}>
              <Icon name="arrow" size={16} />
              返回 Skills
            </button>
          )}
          <button
            className="button button-ghost"
            onClick={() => onNavigate("workspaces")}
          >
            <Icon name="folder" size={16} />
            管理工作空间
          </button>
        </div>
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
        {browserUrl && (
          <button
            className="button button-ghost"
            type="button"
            onClick={() => openExternalSource(browserUrl)}
          >
            <Icon name="external" size={15} />
            浏览网页
          </button>
        )}
        <button
          className="button button-primary"
          type="button"
          disabled={!request || busy}
          onClick={() => void browse()}
        >
          <Icon name="search" size={15} />
          {busy ? "读取中…" : updateSkill ? "检查更新" : "检查并读取"}
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
            <div className="source-result-actions">
              {browseResult.skills.length > 0 && (
                <span>
                  {updateSkill
                    ? "已加载当前 Skill 来源"
                    : `${uninstalledCount} 个未安装`}
                </span>
              )}
              {sourceBrowserUrl(browseResult.source) && (
                <button
                  className="button button-ghost source-browser-link"
                  type="button"
                  onClick={() =>
                    openExternalSource(sourceBrowserUrl(browseResult.source)!)
                  }
                >
                  <Icon name="external" size={14} />
                  在浏览器打开来源
                </button>
              )}
            </div>
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
            <>
              <div className="marketplace-result-tools">
                <label>
                  <Icon name="search" size={15} />
                  <span className="sr-only">搜索当前来源中的 Skill</span>
                  <input
                    type="search"
                    value={catalogQuery}
                    onChange={(event) => setCatalogQuery(event.target.value)}
                    placeholder="搜索当前来源中的 Skill"
                  />
                </label>
                <div role="group" aria-label="安装状态筛选">
                  <button
                    type="button"
                    className={catalogFilter === "uninstalled" ? "active" : ""}
                    aria-pressed={catalogFilter === "uninstalled"}
                    onClick={() => setCatalogFilter("uninstalled")}
                  >
                    未安装 {uninstalledCount}
                  </button>
                  <button
                    type="button"
                    className={catalogFilter === "all" ? "active" : ""}
                    aria-pressed={catalogFilter === "all"}
                    onClick={() => setCatalogFilter("all")}
                  >
                    全部 {browseResult.skills.length}
                  </button>
                </div>
              </div>
              {visibleSourceSkills.length > 0 ? (
                <div className="source-skill-list">
                  {visibleSourceSkills.map((skill) => {
                    const installations = installedSkillsFor(
                      skill,
                      installedSkills,
                    );
                    return (
                      <button
                        key={skill.relativePath}
                        className={
                          selectedSkillKey === discoveredSkillKey(skill)
                            ? "selected"
                            : ""
                        }
                        disabled={!skill.installable}
                        onClick={() =>
                          setSelectedSkillKey(discoveredSkillKey(skill))
                        }
                      >
                        <span>
                          <strong>{skill.displayName}</strong>
                          <small>
                            {skill.relativePath} ·{" "}
                            {skill.description ?? "暂无描述"}
                          </small>
                        </span>
                        <em className={installations.length ? "installed" : ""}>
                          {!skill.installable
                            ? "需处理"
                            : installations.length
                              ? `已安装 ${installations.length}`
                              : "未安装"}
                        </em>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="marketplace-empty-result">
                  <Icon name="search" size={18} />
                  <span>当前筛选下没有 Skill，试试查看全部或更换关键词。</span>
                </div>
              )}
            </>
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
            {busy ? "生成中…" : updateSkill ? "生成更新计划" : "生成安装计划"}
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
              {busy ? "执行中…" : updateSkill ? "确认更新" : "确认安装"}
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
              placeholder="例如 ~/projects/demo"
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
  skills,
  diagnosticFocus,
  onDismissDiagnostic,
  onNavigate,
  onViewSkillDetails,
  onRepair,
  searchQuery,
}: {
  diagnostics: UnifiedDiagnostic[];
  skills?: SkillInventory;
  diagnosticFocus?: UnifiedDiagnostic;
  onDismissDiagnostic: () => void;
  onNavigate: (section: Section) => void;
  onViewSkillDetails: (item: UnifiedDiagnostic) => void;
  onRepair: () => void;
  searchQuery: string;
}) {
  const [recoveryPreview, setRecoveryPreview] =
    useState<DiagnosticRecoveryPreview>();
  const [recoveryDiagnostic, setRecoveryDiagnostic] =
    useState<UnifiedDiagnostic>();
  const [recoveryMessage, setRecoveryMessage] = useState<string>();
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [legacyActionPath, setLegacyActionPath] = useState<string>();
  const [legacyFeedback, setLegacyFeedback] = useState<LegacySkillFeedback>();
  const { confirm: confirmLegacy, ConfirmPortal: LegacyConfirmPortal } =
    useConfirm();
  const diagnosticsScrollPosition = useRef({ main: 0, window: 0 });
  const recoveryReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const issueDiagnostics = diagnostics.filter(
    (item) => item.severity !== "info",
  );
  const errorCount = issueDiagnostics.filter(
    (item) => item.severity === "error",
  ).length;
  const warningCount = issueDiagnostics.filter(
    (item) => item.severity === "warning",
  ).length;
  const actionable = issueDiagnostics
    .filter((item) => {
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
  async function previewRecovery(
    item: UnifiedDiagnostic,
    trigger?: HTMLButtonElement,
  ) {
    const main = document.querySelector<HTMLElement>(".main-content");
    diagnosticsScrollPosition.current = {
      main: main?.scrollTop ?? 0,
      window: window.scrollY,
    };
    recoveryReturnFocusRef.current = trigger ?? null;
    setRecoveryBusy(true);
    setRecoveryMessage(undefined);
    setRecoveryPreview(undefined);
    setRecoveryDiagnostic(undefined);
    try {
      const preview = await previewDiagnosticRecovery({
        diagnosticCode: item.code,
        resourcePath: item.resourcePath ?? undefined,
      });
      setRecoveryPreview(preview);
      setRecoveryDiagnostic(item);
      window.requestAnimationFrame(() => {
        main?.scrollTo({ top: 0 });
        window.scrollTo({ top: 0 });
      });
    } catch {
      setRecoveryMessage("该问题需要在对应功能中手动处理，请按建议打开详情。");
    } finally {
      setRecoveryBusy(false);
    }
  }
  useEffect(() => {
    if (!recoveryMessage) return;
    document.getElementById("recovery-message")?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [recoveryMessage]);
  const recoveryPresentation = recoveryPreview
    ? diagnosticRecoveryPresentation(recoveryPreview, recoveryDiagnostic)
    : undefined;
  useEffect(() => {
    if (!recoveryPresentation) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("recovery-page-title")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [recoveryPresentation]);
  async function handleLegacyAction(
    sourcePath: string,
    action: "migrate" | "archive",
  ) {
    if (legacyActionPath) return;
    const opts = legacyActionConfirmOptions(sourcePath, action);
    const ok = await confirmLegacy({
      tone: "neutral",
      title: opts.title,
      description: (
        <>
          <div className="modal-paths">
            {opts.paths.map((p) => (
              <code key={p}>{p}</code>
            ))}
          </div>
          <p>{opts.note}</p>
        </>
      ),
      confirmLabel: action === "migrate" ? "确认迁移" : "确认归档",
    });
    if (!ok) return;
    setLegacyActionPath(sourcePath);
    setLegacyFeedback(undefined);
    try {
      const result = await resolveLegacyCodexSkill({ sourcePath, action });
      setLegacyFeedback(successfulLegacyActionFeedback(result));
      onRepair();
    } catch (error) {
      setLegacyFeedback(failedLegacyActionFeedback(error));
    } finally {
      setLegacyActionPath(undefined);
    }
  }
  if (diagnosticFocus) {
    const focusedSkills = matchingSkillsForDiagnostic(
      diagnosticFocus,
      skills?.skills ?? [],
    );
    const legacySkill = focusedSkills.find(
      (skill) =>
        skill.agent === "codex" &&
        skill.path.includes("/.codex/skills/") &&
        !isCodexSystemSkillPath(skill.path),
    );
    const legacyAction = focusedSkills.some(
      (skill) =>
        skill.agent === "codex" && skill.path.includes("/.agents/skills/"),
    )
      ? "archive"
      : "migrate";
    return (
      <div className="page diagnostic-detail-page">
        {LegacyConfirmPortal}
        <PageNavigation
          backLabel="返回诊断列表"
          onBack={onDismissDiagnostic}
          eyebrow="诊断中心 / 处理方案"
          title={diagnosticSubject(diagnosticFocus)}
          titleId="diagnostic-detail-title"
          titleTabIndex={-1}
          description={diagnosticProblem(diagnosticFocus)}
          actions={
            <span className={`diagnostic-severity ${diagnosticFocus.severity}`}>
              {diagnosticFocus.severity === "error" ? "错误" : "警告"}
            </span>
          }
        />
        {legacyFeedback && (
          <Modal
            open
            onClose={() => setLegacyFeedback(undefined)}
            tone={legacyFeedback.tone === "error" ? "error" : "success"}
            title={legacyFeedback.title}
            icon={
              <Icon
                name={legacyFeedback.tone === "error" ? "warning" : "check"}
                size={20}
              />
            }
            actions={
              <button
                className="button button-primary"
                type="button"
                onClick={() => setLegacyFeedback(undefined)}
              >
                关闭结果
              </button>
            }
          >
            <p>{legacyFeedback.summary}</p>
            {(legacyFeedback.originalPath ||
              legacyFeedback.destinationPath ||
              legacyFeedback.backupPath) && (
              <div className="modal-paths">
                {legacyFeedback.originalPath && (
                  <code>原位置：{legacyFeedback.originalPath}</code>
                )}
                {legacyFeedback.destinationPath && (
                  <code>
                    {legacyFeedback.destinationLabel ?? "目标位置"}：
                    {legacyFeedback.destinationPath}
                  </code>
                )}
                {legacyFeedback.backupPath &&
                  legacyFeedback.backupPath !==
                    legacyFeedback.destinationPath && (
                    <code>备份位置：{legacyFeedback.backupPath}</code>
                  )}
              </div>
            )}
          </Modal>
        )}
        <section
          className={`skill-issue-panel ${diagnosticFocus.severity}`}
          aria-labelledby="diagnostic-detail-title"
        >
          <div className="skill-issue-summary">
            <article className="skill-issue-summary-card impact">
              <span className="skill-issue-summary-icon">
                <Icon name="warning" size={18} />
              </span>
              <div>
                <strong>可能影响</strong>
                <p>{diagnosticFocus.impact}</p>
              </div>
            </article>
            <article className="skill-issue-summary-card recommendation">
              <span className="skill-issue-summary-icon">
                <Icon name="check" size={18} />
              </span>
              <div>
                <strong>处理建议</strong>
                <p>{diagnosticFocus.nextAction}</p>
              </div>
            </article>
          </div>
          <dl className="skill-issue-facts">
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
            {diagnosticFocus.code === "skill:symlink-skipped" && (
              <>
                <div>
                  <dt>入口类型</dt>
                  <dd className="skill-storage-kind symlink">
                    软链接 <Icon name="link" size={14} />
                  </dd>
                </div>
                <div>
                  <dt>真实 Skill 路径</dt>
                  <dd className="mono">
                    {diagnosticRealSkillPath(diagnosticFocus) ??
                      "无法解析链接目标"}
                  </dd>
                </div>
              </>
            )}
            {diagnosticFocus.code === "skill:codex-legacy-location" &&
              focusedSkills[0] && (
                <>
                  <div>
                    <dt>迁移目标</dt>
                    <dd className="mono">
                      {preferredCodexSkillDirectory(focusedSkills[0].path)}
                    </dd>
                  </div>
                  <div>
                    <dt>如何处理</dt>
                    <dd>
                      迁移会移动整个目录，不覆盖已有
                      Skill；如果目标已存在，改用“归档旧副本”。
                    </dd>
                  </div>
                  <div>
                    <dt>备份位置</dt>
                    <dd>
                      迁移前会先创建完整备份；完成后显示绝对路径。备份位于
                      <code>~/.agenthub/backups/legacy-codex-skills/</code>。
                    </dd>
                  </div>
                </>
              )}
          </dl>
          {focusedSkills.length > 0 && (
            <div className="skill-issue-locations">
              <strong>相关安装位置</strong>
              {focusedSkills.map((skill) => (
                <SkillLocation
                  key={`${skill.agent}-${skill.scope}-${skill.path}`}
                  skill={skill}
                />
              ))}
            </div>
          )}
          <div className="skill-issue-actions">
            <button className="button button-secondary" onClick={onRepair}>
              <Icon name="refresh" size={15} />
              重新扫描
            </button>
            {legacySkill && (
              <button
                className="button button-primary"
                type="button"
                disabled={Boolean(legacyActionPath)}
                onClick={() =>
                  void handleLegacyAction(legacySkill.path, legacyAction)
                }
              >
                {legacyActionPath
                  ? legacyAction === "archive"
                    ? "归档中…"
                    : "迁移中…"
                  : legacyAction === "archive"
                    ? "保留 .agents 并归档旧副本"
                    : "迁移到 .agents/skills"}
              </button>
            )}
          </div>
        </section>
      </div>
    );
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
        recoveryPresentation?.readOnly
          ? "扫描完成，诊断结果已刷新；没有修改任何文件。"
          : result.outcome === "applied"
            ? "修复已应用，并已刷新诊断。"
            : "安全恢复已执行，并已刷新诊断。",
      );
      setRecoveryPreview(undefined);
      setRecoveryDiagnostic(undefined);
      onRepair();
    } catch {
      setRecoveryMessage("恢复未执行：状态可能已变化，请重新扫描后预览。");
    } finally {
      setRecoveryBusy(false);
    }
  }
  function closeRecoveryPage() {
    const main = document.querySelector<HTMLElement>(".main-content");
    setRecoveryPreview(undefined);
    setRecoveryDiagnostic(undefined);
    window.requestAnimationFrame(() => {
      main?.scrollTo({ top: diagnosticsScrollPosition.current.main });
      window.scrollTo({ top: diagnosticsScrollPosition.current.window });
      recoveryReturnFocusRef.current?.focus();
      recoveryReturnFocusRef.current = null;
    });
  }
  if (recoveryPreview && recoveryPresentation) {
    return (
      <DiagnosticRecoveryPage
        presentation={recoveryPresentation}
        warningIcon={
          <Icon
            name={recoveryPresentation.readOnly ? "check" : "warning"}
            size={15}
          />
        }
        onBack={closeRecoveryPage}
        onExecute={() => void executeRecovery()}
        busy={recoveryBusy}
      />
    );
  }
  return (
    <div className="page">
      <header className="diagnostics-page-heading">
        <div>
          <p className="eyebrow">运行状态 / Diagnostics</p>
          <h1>诊断中心</h1>
          <p>集中查看需要确认的配置、Skill 和存储问题。</p>
        </div>
        <dl className="diagnostics-summary" aria-label="诊断问题统计">
          <div className="total">
            <dt>待处理</dt>
            <dd>{issueDiagnostics.length}</dd>
          </div>
          <div className="error">
            <dt>错误</dt>
            <dd>{errorCount}</dd>
          </div>
          <div className="warning">
            <dt>警告</dt>
            <dd>{warningCount}</dd>
          </div>
        </dl>
      </header>
      {normalizedQuery && (
        <p className="diagnostics-filter-result" role="status">
          当前搜索显示 {actionable.length} / {issueDiagnostics.length} 项问题
        </p>
      )}
      {recoveryMessage && (
        <div
          className="alert alert-warning"
          id="recovery-message"
          role="status"
          aria-live="polite"
        >
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
                {item.resourcePath && (
                  <span className="diagnostic-resource-path">
                    <code>{item.resourcePath}</code>
                    {item.code === "skill:symlink-skipped" && (
                      <Icon name="link" size={14} />
                    )}
                  </span>
                )}
              </div>
              <div className="diagnostic-actions">
                {item.fixSafety !== "manual" &&
                  !item.kind.includes("config") && (
                    <button
                      className="button button-secondary"
                      disabled={recoveryBusy}
                      onClick={(event) =>
                        void previewRecovery(item, event.currentTarget)
                      }
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
  const [tab, setTab] = useState<"privacy" | "scanning" | "data">("privacy");
  const [dataPaths, setDataPaths] =
    useState<Awaited<ReturnType<typeof getUserDataPaths>>>();
  const [pathError, setPathError] = useState<string>();
  const [clearingKind, setClearingKind] = useState<
    "backups" | "logs" | "skillSources"
  >();
  const [pendingClear, setPendingClear] = useState<{
    kind: "backups" | "logs" | "skillSources";
    label: string;
  }>();
  useEffect(() => {
    void getUserDataPaths()
      .then(setDataPaths)
      .catch(() => {
        setPathError("无法读取 AgentHub 用户数据目录，请稍后重试。");
      });
  }, []);
  function openPath(path: string) {
    void revealItemInDir(path).catch(() => {
      setPathError("无法打开文件管理器，请检查系统权限设置。");
    });
  }
  const dataLocations = dataPaths
    ? ([
        ["AgentHub 数据目录", dataPaths.root, undefined],
        ["数据库", dataPaths.database, undefined],
        ["备份", dataPaths.backups, "backups"],
        ["Skill 来源缓存", dataPaths.skillSources, "skillSources"],
        ["日志", dataPaths.logs, "logs"],
      ] as const)
    : [];
  function clearPath(kind: "backups" | "logs" | "skillSources", label: string) {
    setPendingClear({ kind, label });
  }
  function confirmClear() {
    if (!pendingClear) return;
    const { kind, label } = pendingClear;
    setPendingClear(undefined);
    setClearingKind(kind);
    setPathError(undefined);
    void clearUserData(kind)
      .then(setDataPaths)
      .catch(() => setPathError(`无法清理${label}，请稍后重试。`))
      .finally(() => setClearingKind(undefined));
  }
  return (
    <div className="page">
      <div className="settings-heading">
        <div>
          <p className="eyebrow">应用设置</p>
          <h1>设置</h1>
        </div>
        <p>管理本地隐私策略、扫描偏好和 AgentHub 用户数据。</p>
      </div>
      <SubTabs
        value={tab}
        ariaLabel="设置分类"
        onChange={setTab}
        items={[
          {
            value: "privacy",
            label: "隐私与安全",
            icon: <Icon name="shield" size={16} />,
          },
          {
            value: "scanning",
            label: "扫描偏好",
            icon: <Icon name="refresh" size={16} />,
          },
          {
            value: "data",
            label: "用户数据",
            icon: <Icon name="folder" size={16} />,
          },
        ]}
      />
      <div className="settings-panel">
        {tab === "privacy" && (
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
        )}
        {tab === "scanning" && (
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
        )}
        {tab === "data" && (
          <section className="surface-card settings-data-card">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">用户数据</p>
                <h2>数据目录与备份</h2>
              </div>
              <Icon name="folder" size={24} />
            </div>
            <p className="settings-data-description">
              AgentHub 的数据库、备份、Skill
              来源缓存和日志都保存在本机。打开目录不会修改其中的文件。
            </p>
            <div className="settings-data-list">
              {dataLocations.map(([label, location, clearKind]) => (
                <div className="settings-data-row" key={location.path}>
                  <div>
                    <strong>{label}</strong>
                    <code title={location.path}>
                      {compactUserPath(location.path)}
                    </code>
                    <span className="settings-data-size">
                      {formatBytes(location.bytes)}
                    </span>
                  </div>
                  <div className="settings-data-actions">
                    <button
                      className="button button-ghost"
                      type="button"
                      onClick={() => openPath(location.path)}
                    >
                      <Icon name="external" size={14} />
                      打开目录
                    </button>
                    {clearKind && (
                      <button
                        className="button button-danger-ghost"
                        type="button"
                        disabled={Boolean(clearingKind)}
                        onClick={() => clearPath(clearKind, label)}
                      >
                        {clearingKind === clearKind ? "清理中…" : "清理"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {pathError && (
              <p className="settings-data-error" role="alert">
                {pathError}
              </p>
            )}
          </section>
        )}
        {pendingClear && (
          <ConfirmModal
            open
            tone="danger"
            title={`确定清理${pendingClear.label}？`}
            description={
              <>
                这会删除该目录中的文件，操作完成后无法从 AgentHub 恢复。
                {pendingClear.kind === "backups"
                  ? "数据库、日志和 Skill 来源缓存不会受到影响。"
                  : "数据库和备份不会受到影响。"}
              </>
            }
            confirmLabel="确认清理"
            onCancel={() => setPendingClear(undefined)}
            onConfirm={confirmClear}
          />
        )}
      </div>
    </div>
  );
}
