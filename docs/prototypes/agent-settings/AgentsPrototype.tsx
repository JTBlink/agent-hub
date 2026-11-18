// Requirements prototype: latest Settings card geometry, synthetic data only.
import { useState } from "react";
import {
  Cloud,
  GripVertical,
  Moon,
  Plus,
  Sun,
  TerminalSquare,
} from "lucide-react";
import { AgentIcon } from "../../../src/components/AgentIcon";
import { ToggleSwitch } from "../../../src/components/ToggleSwitch";
import { ThemedSelect } from "../../../src/components/ThemedSelect";
import { CardActionMenu } from "../../../src/components/CardActionMenu";
import { AppDialog } from "../../../src/components/AppDialog";
import type { LaunchSettingsPrototype } from "./useLaunchSettingsPrototype";
import { LaunchGroupEditor } from "./LaunchGroupEditor";

export function AgentsPrototype({
  settings,
  onBackup,
}: {
  settings: LaunchSettingsPrototype;
  onBackup: () => void;
}) {
  const {
    agents,
    setAgents,
    groups,
    setGroups,
    defaultAgent,
    setDefaultAgent,
  } = settings;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("installed");
  const [dark, setDark] = useState(
    document.documentElement.classList.contains("dark"),
  );
  const [showOther, setShowOther] = useState(false);
  const [launchPreview, setLaunchPreview] = useState(false);
  const [notice, setNotice] = useState("");
  const [launchAgent, setLaunchAgent] = useState("codex");
  const [launchGroup, setLaunchGroup] = useState("default");
  const installed = agents.filter((agent) => agent.installed);
  const enabled = installed.filter((agent) => agent.enabled);
  const matching = agents.filter(
    (agent) =>
      (filter === "all" ||
        (filter === "installed"
          ? agent.installed
          : agent.installed && agent.enabled)) &&
      `${agent.display_name} ${groups[agent.key].groups.map((group) => `${group.name} ${group.command}`).join(" ")}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const activeGroup =
    groups[launchAgent].groups.find((group) => group.id === launchGroup) ??
    groups[launchAgent].groups[0];
  const preview = () => {
    setLaunchAgent(defaultAgent);
    setLaunchGroup(groups[defaultAgent].defaultId);
    setLaunchPreview(true);
  };
  return (
    <section>
      <div className="mb-3 flex min-w-0 items-center gap-3 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm">
        <Cloud className="h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-secondary">
          {!settings.backupEnabled
            ? "启动配置 · 未加入备份"
            : settings.backup
              ? settings.changed
                ? "启动配置 · 有待备份更改"
                : "启动配置 · 已创建演示备份"
              : "启动配置 · 待备份"}
        </span>
        <button
          type="button"
          className="text-xs text-accent"
          onClick={onBackup}
        >
          备份设置
        </button>
        <button
          type="button"
          aria-label="切换主题"
          className="app-button-ghost p-1"
          onClick={() => {
            document.documentElement.classList.toggle("dark");
            setDark(!dark);
          }}
        >
          {dark ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-3">
        <div
          className="flex shrink-0 gap-1"
          role="group"
          aria-label="筛选智能体"
        >
          {[
            { id: "installed", name: "已安装", count: installed.length },
            { id: "enabled", name: "已启用", count: enabled.length },
            { id: "all", name: "全部", count: agents.length },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              className={`rounded-md px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent ${filter === item.id ? "bg-surface-active font-medium text-primary" : "text-muted hover:bg-surface-hover"}`}
              onClick={() => setFilter(item.id)}
            >
              {item.name} <span className="ml-1 text-xs">{item.count}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="搜索智能体或启动方案"
          placeholder="搜索智能体或启动方案"
          className="app-input ml-auto min-w-0 max-w-sm flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <CardActionMenu
          label="更多操作"
          triggerIcon={<span className="text-sm">更多</span>}
          triggerClassName="!w-auto px-2"
          actions={[
            {
              key: "enable",
              label: "全部启用",
              onSelect: () =>
                setAgents((all) =>
                  all.map((agent) => ({ ...agent, enabled: true })),
                ),
            },
            {
              key: "disable",
              label: "全部禁用",
              onSelect: () =>
                setAgents((all) =>
                  all.map((agent) => ({ ...agent, enabled: false })),
                ),
            },
          ]}
        />
      </div>
      <div className="space-y-4">
        {[
          {
            id: "detected",
            title: "已检测到的智能体",
            items: matching.filter(
              (agent) => agent.installed && !agent.is_custom,
            ),
          },
          {
            id: "other",
            title: "其他智能体",
            items: matching.filter(
              (agent) => !agent.installed && !agent.is_custom,
            ),
          },
          {
            id: "custom",
            title: "自定义智能体",
            items: matching.filter((agent) => agent.is_custom),
          },
        ].map(
          (section) =>
            section.items.length > 0 && (
              <div key={section.id}>
                <div className="mb-2 flex items-center justify-between text-sm text-secondary">
                  {section.id === "other" ? (
                    <button
                      type="button"
                      onClick={() => setShowOther(!showOther)}
                    >
                      {showOther || query ? "▾" : "▸"} {section.title}
                    </button>
                  ) : (
                    <h3>{section.title}</h3>
                  )}
                  <span className="text-xs text-muted">
                    {section.items.length}
                  </span>
                </div>
                {(section.id !== "other" || showOther || query) && (
                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                    {section.items.map((agent) => (
                      <fieldset
                        key={agent.key}
                        className="group relative flex h-full min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-3"
                      >
                        <div className="flex items-start gap-2.5">
                          <GripVertical className="mt-1 h-4 w-4 shrink-0 text-faint" />
                          <AgentIcon
                            agentKey={agent.key}
                            displayName={agent.display_name}
                            className="mt-px h-6 w-6 shrink-0 rounded-md"
                          />
                          <h3 className="min-w-0 flex-1 truncate text-base font-semibold">
                            {agent.display_name}
                          </h3>
                          <ToggleSwitch
                            title={`启用 ${agent.display_name}`}
                            checked={agent.enabled && agent.installed}
                            disabled={!agent.installed}
                            onChange={() =>
                              setAgents((all) =>
                                all.map((item) =>
                                  item.key === agent.key
                                    ? { ...item, enabled: !item.enabled }
                                    : item,
                                ),
                              )
                            }
                          />
                        </div>
                        <LaunchGroupEditor
                          agentKey={agent.key}
                          name={agent.display_name}
                          value={groups[agent.key]}
                          onChange={(next) =>
                            setGroups((all) => ({ ...all, [agent.key]: next }))
                          }
                        />
                        <div className="flex items-center justify-between gap-2 border-t border-border-faint pt-2 text-xs text-muted">
                          <span>{groups[agent.key].groups.length} 套方案</span>
                          <button
                            type="button"
                            disabled={!agent.installed || !agent.enabled}
                            className="text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
                            onClick={() => setDefaultAgent(agent.key)}
                          >
                            {defaultAgent === agent.key
                              ? "默认 Agent"
                              : "设为默认 Agent"}
                          </button>
                        </div>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-muted">
                            详细设置
                          </summary>
                          <div className="mt-2 space-y-1 text-xs text-muted">
                            <p className="truncate font-mono">
                              {agent.skills_dir}
                            </p>
                            <p>
                              项目路径：
                              <code>
                                {agent.project_relative_skills_dir || "未配置"}
                              </code>
                            </p>
                          </div>
                        </details>
                      </fieldset>
                    ))}
                  </div>
                )}
              </div>
            ),
        )}
        {matching.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            没有匹配的智能体或启动方案
          </p>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3 text-xs text-muted">
        <span className="flex-1">
          方案按 Agent 保存，选择编辑对象不会改变默认方案。
        </span>
        <button
          type="button"
          className="app-button-secondary"
          onClick={preview}
        >
          <TerminalSquare className="h-3.5 w-3.5" />
          启动选择预览
        </button>
      </div>
      {notice && (
        <p
          role="status"
          className="mt-3 rounded border border-accent-border bg-accent-bg p-3 text-sm text-secondary"
        >
          {notice}
        </p>
      )}
      {launchPreview && (
        <AppDialog
          title="新建 Agent 终端"
          onClose={() => setLaunchPreview(false)}
        >
          <div className="space-y-4">
            <label className="block space-y-1 text-xs text-secondary">
              Agent
              <ThemedSelect
                aria-label="启动 Agent"
                className="app-input w-full"
                value={launchAgent}
                onChange={(event) => {
                  const key = event.target.value;
                  setLaunchAgent(key);
                  setLaunchGroup(groups[key].defaultId);
                }}
              >
                {enabled.map((agent) => (
                  <option key={agent.key} value={agent.key}>
                    {agent.display_name}
                  </option>
                ))}
              </ThemedSelect>
            </label>
            <label className="block space-y-1 text-xs text-secondary">
              启动方案
              <ThemedSelect
                aria-label="本次启动方案"
                className="app-input w-full"
                value={activeGroup.id}
                onChange={(event) => setLaunchGroup(event.target.value)}
              >
                {groups[launchAgent].groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                    {group.id === groups[launchAgent].defaultId
                      ? " · 默认"
                      : ""}
                  </option>
                ))}
              </ThemedSelect>
            </label>
            <div>
              <p className="mb-1 text-xs text-muted">本次启动指令</p>
              <code className="block break-all rounded border border-border bg-background p-3 text-xs leading-6 text-secondary">
                {activeGroup.command || "尚未填写启动指令"}
              </code>
            </div>
            <p className="text-xs text-muted">仅本次使用，不改变默认方案。</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="app-button-secondary"
                onClick={() => setLaunchPreview(false)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={
                  !activeGroup.command.trim() ||
                  !enabled.some((agent) => agent.key === launchAgent)
                }
                className="app-button-primary"
                onClick={() => {
                  setNotice(
                    `预览：将以 ${activeGroup.name} 启动 ${launchAgent}，命令为 ${activeGroup.command}。原型未执行命令。`,
                  );
                  setLaunchPreview(false);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                新建终端
              </button>
            </div>
          </div>
        </AppDialog>
      )}
    </section>
  );
}
