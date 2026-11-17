import { useMemo, useState } from "react";
import {
  Bot,
  FolderGit2,
  Import,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { DetailSheet } from "../../../src/components/DetailSheet";
import { ThemedSelect } from "../../../src/components/ThemedSelect";
import { cn } from "../../../src/utils";
import {
  AGENTS,
  ROLES,
  type AgentKey,
  contractPreview,
  nativePreview,
  roleState,
} from "./subagentsData";

type Tab = "contract" | "native" | "deploy";

import {
  Field,
  RoleCard,
  RoleTable,
  ProjectBanner,
  CommitPanel,
  StateChip,
} from "./SubagentsParts";
import {
  AddDialog,
  ImportDialog,
  CommitDialog,
  ConflictDialog,
} from "./SubagentsDialogs";

export function SubagentsPrototype({
  view,
  onViewChange,
}: {
  view: "library" | "project";
  onViewChange: (view: "library" | "project") => void;
}) {
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("contract");
  const [nativeAgent, setNativeAgent] = useState<AgentKey>("claude_code");
  const [dialog, setDialog] = useState<
    "add" | "import" | "conflict" | "commit" | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useMemo(
    () =>
      ROLES.filter((role) => {
        const q = query.trim().toLowerCase();
        if (q && !(role.id + role.description).toLowerCase().includes(q))
          return false;
        if (
          agentFilter !== "all" &&
          !role.agents.includes(agentFilter as AgentKey)
        )
          return false;
        if (stateFilter !== "all" && roleState(role) !== stateFilter)
          return false;
        return true;
      }),
    [agentFilter, query, stateFilter],
  );
  const selected = ROLES.find((role) => role.id === selectedId) ?? null;

  const toast = (text: string) => setNotice(text);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Sidebar stand-in: library / project entries, same chrome as the app. */}
      <aside className="workbench-sidebar-panel flex w-[200px] shrink-0 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-2 px-3">
          <span className="truncate text-xs font-semibold text-secondary">
            Subagents
          </span>
          <span className="ml-auto rounded-full bg-surface-active px-1.5 text-xs tabular-nums text-muted">
            {ROLES.length}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {[
            { id: "library" as const, label: "个人库", icon: Sparkles },
            {
              id: "project" as const,
              label: "work-native-ui",
              icon: FolderGit2,
            },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent",
                view === item.id
                  ? "bg-surface-active font-medium text-primary"
                  : "text-secondary hover:bg-surface-hover hover:text-primary",
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          ))}
          <div className="my-2 h-px bg-border-subtle" />
          {ROLES.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => {
                setSelectedId(role.id);
                setTab("contract");
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-secondary outline-none transition-colors hover:bg-surface-hover hover:text-primary focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Bot className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 truncate">{role.id}</span>
              {roleState(role) !== "ok" && (
                <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
              )}
            </button>
          ))}
        </div>
      </aside>

      <div className="workbench-editor-panel mr-1 flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="workbench-page-host min-h-0 flex-1 overflow-y-auto p-3">
          <div className="app-page">
            <header className="app-page-header">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="app-page-title">
                    {view === "library"
                      ? "Subagents"
                      : "work-native-ui · Subagents"}
                  </h1>
                  <p className="app-page-subtitle">
                    {view === "library"
                      ? "一份工具中立的角色契约，按每个 Agent 的格式渲染原生定义，再链接或复制到它自己的命名目录。库内只维护契约，原生文件由 AgentHub 生成。"
                      : "项目库把实际内容放在 .agents/subagents/ 并提交 Git；成员拉取后由 Agent 直接读取，不需要个人库或 AgentHub。"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDialog(view === "library" ? "import" : "commit")
                    }
                    className="app-button-secondary"
                  >
                    <Import className="h-3.5 w-3.5" />
                    {view === "library" ? "导入…" : "需提交文件"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialog("add")}
                    className="app-button-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {view === "library" ? "添加到工作空间" : "添加角色"}
                  </button>
                </div>
              </div>
            </header>

            {view === "library" ? (
              <>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {[
                    { value: ROLES.length, label: "角色契约" },
                    { value: 2, label: "已安装的 Agent 目标" },
                    { value: 2, label: "项目中央库" },
                    {
                      value: ROLES.reduce((n, r) => n + r.entries.length, 0),
                      label: "原生入口",
                    },
                  ].map((stat) => (
                    <div key={stat.label} className="app-panel px-3 py-2">
                      <b className="block text-lg font-semibold tabular-nums">
                        {stat.value}
                      </b>
                      <span className="text-xs text-muted">{stat.label}</span>
                    </div>
                  ))}
                </div>

                <div className="app-toolbar">
                  <label className="relative min-w-0 flex-1 basis-64">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="搜索名称或职责描述"
                      aria-label="搜索名称或职责描述"
                      className="app-input w-full pl-9"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <ThemedSelect
                      value={agentFilter}
                      onChange={(e) => setAgentFilter(e.target.value)}
                      aria-label="目标 Agent"
                      className="app-input"
                    >
                      <option value="all">全部目标 Agent</option>
                      <option value="claude_code">Claude Code</option>
                      <option value="codex">Codex</option>
                    </ThemedSelect>
                    <ThemedSelect
                      value={stateFilter}
                      onChange={(e) => setStateFilter(e.target.value)}
                      aria-label="状态"
                      className="app-input"
                    >
                      <option value="all">全部状态</option>
                      <option value="ok">正常</option>
                      <option value="stale">副本待刷新</option>
                      <option value="edited">外部修改</option>
                    </ThemedSelect>
                    <div className="app-segmented app-toolbar-segmented">
                      {(["grid", "list"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setLayout(mode)}
                          className={cn(
                            "app-segmented-button",
                            layout === mode && "app-segmented-button-active",
                          )}
                        >
                          {mode === "grid" ? "卡片" : "列表"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {list.length === 0 ? (
                  <div className="app-panel p-6 text-center text-sm text-muted">
                    没有匹配的角色。调整筛选条件，或从已有项目导入。
                  </div>
                ) : layout === "grid" ? (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {list.map((role) => (
                      <RoleCard
                        key={role.id}
                        role={role}
                        onOpen={() => {
                          setSelectedId(role.id);
                          setTab("contract");
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <RoleTable roles={list} onOpen={setSelectedId} />
                )}
              </>
            ) : (
              <>
                <ProjectBanner role={ROLES[1]} onOpen={setDialog} />
                <RoleTable roles={ROLES} onOpen={setSelectedId} project />
                <CommitPanel />
              </>
            )}
          </div>
        </div>
      </div>

      <DetailSheet
        open={selected !== null}
        title={selected?.id ?? ""}
        description={selected?.description}
        onClose={() => setSelectedId(null)}
        headerActions={
          selected && (
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setNotice("已保存契约并重新渲染全部原生入口");
              }}
              className="app-button-primary"
            >
              保存并重新渲染
            </button>
          )
        }
        meta={
          selected && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              <code className="rounded-sm bg-surface px-1.5 py-0.5">
                {selected.source}
              </code>
              <span>更新于 {selected.updated}</span>
              <div className="app-segmented">
                {(
                  [
                    ["contract", "契约"],
                    ["native", "原生定义"],
                    ["deploy", "部署状态"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={cn(
                      "app-segmented-button",
                      tab === key && "app-segmented-button-active",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )
        }
      >
        {selected && tab === "contract" && (
          <div className="space-y-3 text-sm">
            <Field label="名称（各 Agent 共用）">
              <input
                className="app-input w-full"
                value={selected.id}
                readOnly
              />
              <p className="text-xs text-muted">
                名称只写一次。原生文件由渲染生成，不改名、不复制第二份契约。
              </p>
            </Field>
            <Field label="职责描述（用于子代理自动委派判断）">
              <input
                className="app-input w-full"
                value={selected.description}
                readOnly
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="模型">
                <ThemedSelect
                  value="inherit"
                  onChange={() => {}}
                  className="app-input w-full"
                >
                  <option value="inherit">inherit（跟随宿主默认）</option>
                  <option value="custom">指定模型</option>
                </ThemedSelect>
              </Field>
              <Field label="可用工具">
                <input
                  className="app-input w-full"
                  value={selected.tools.join(", ")}
                  readOnly
                />
              </Field>
            </div>
            <Field
              label={`契约正文 · .agents/subagents/${selected.id}/${selected.contract}`}
            >
              <textarea
                spellCheck={false}
                className="app-panel min-h-56 w-full resize-y p-3 font-mono text-xs leading-6 text-secondary"
                defaultValue={contractPreview(selected)}
              />
              <p className="text-xs text-muted">
                正文工具中立。Codex 没有 tools 概念时忽略该键，不会丢失正文。
              </p>
            </Field>
          </div>
        )}

        {selected && tab === "native" && (
          <div className="space-y-3 text-sm">
            <div className="app-segmented">
              {selected.agents.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setNativeAgent(key)}
                  className={cn(
                    "app-segmented-button font-mono",
                    nativeAgent === key && "app-segmented-button-active",
                  )}
                >
                  {AGENTS[key].format}
                </button>
              ))}
            </div>
            <pre className="app-panel overflow-auto p-3 font-mono text-xs leading-6 whitespace-pre-wrap text-secondary">
              {nativePreview(selected, nativeAgent)}
            </pre>
            <div className="rounded-lg border border-accent-border bg-accent-bg p-3 text-xs text-secondary">
              <b className="mb-0.5 block text-primary">不会写入模型名</b>
              渲染只输出 name、description、tools
              与正文。文件头带「勿手工修改」标记；模型默认继承宿主，任务侧不固定。
            </div>
          </div>
        )}

        {selected && tab === "deploy" && (
          <div className="space-y-3">
            <div className="app-panel overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-bg-secondary text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      工作空间
                    </th>
                    <th className="px-3 py-2 text-left font-medium">入口</th>
                    <th className="px-3 py-2 text-left font-medium">方式</th>
                    <th className="px-3 py-2 text-left font-medium">状态</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {selected.entries.map((entry) => (
                    <tr
                      key={`${entry.workspace}-${entry.agent}`}
                      className="border-t border-border-faint"
                    >
                      <td className="px-3 py-2 text-secondary">
                        {entry.workspace}
                      </td>
                      <td className="px-3 py-2">
                        <span className="block font-mono text-xs text-muted">
                          {entry.path}
                        </span>
                        {entry.link && (
                          <span className="block font-mono text-xs text-faint">
                            → {entry.link}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-secondary">
                        {entry.mode === "symlink" ? "链接" : "副本"}
                      </td>
                      <td className="px-3 py-2">
                        <StateChip state={entry.state} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {entry.state === "edited" ? (
                          <button
                            type="button"
                            onClick={() => setDialog("conflict")}
                            className="app-button-secondary"
                          >
                            处理…
                          </button>
                        ) : entry.state === "stale" ? (
                          <button
                            type="button"
                            onClick={() => toast("已按当前契约重新渲染副本")}
                            className="app-button-secondary"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            刷新副本
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toast("已取消该入口")}
                            className="app-button-secondary"
                          >
                            移除
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => setDialog("add")}
              className="app-button-secondary"
            >
              <Link2 className="h-3.5 w-3.5" />
              选择工作空间与 Agent…
            </button>
          </div>
        )}
      </DetailSheet>

      {dialog === "add" && (
        <AddDialog
          onClose={() => setDialog(null)}
          onAdd={() => {
            setDialog(null);
            toast("已部署并写入管理清单");
          }}
        />
      )}
      {dialog === "import" && (
        <ImportDialog
          onClose={() => setDialog(null)}
          onImport={() => {
            setDialog(null);
            toast("已登记 3 个角色，未改写任何原生文件");
          }}
        />
      )}
      {dialog === "commit" && <CommitDialog onClose={() => setDialog(null)} />}
      {dialog === "conflict" && (
        <ConflictDialog
          onClose={() => setDialog(null)}
          onResolve={() => {
            setDialog(null);
            toast("已保留文件并标记为已修改");
          }}
        />
      )}

      {notice && (
        <div
          role="status"
          className="fixed bottom-10 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm shadow-card"
        >
          {notice}
          <button
            type="button"
            className="ml-2 text-xs text-muted"
            onClick={() => setNotice(null)}
          >
            关闭
          </button>
        </div>
      )}
    </div>
  );
}
