// Disposable requirements prototype: one editable launch instruction per Agent.
// Uses native model defaults; no real settings are written.
import { useEffect, useState, type ReactNode } from "react";
import { Check, Moon, Plus, Search, Sun, X } from "lucide-react";
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { AgentGroupDnd } from "../../../src/components/settings/AgentGroupDnd";
import { AgentIcon } from "../../../src/components/AgentIcon";
import { ToggleSwitch } from "../../../src/components/ToggleSwitch";
import "./agents-prototype.css";

import { initialAgents as initial, type PrototypeAgent } from "./agentData";
import { AgentOriginalFields } from "./AgentOriginalFields";
import { AgentCustomForm } from "./AgentCustomForm";
import { AgentSyncPanel } from "./AgentSyncPanel";
import { useAgentSyncPrototype } from "./useAgentSyncPrototype";
import { instructionFor, launchDocument } from "./agentLaunchDocument";

const shortcuts: Record<string, { label: string; flag: string }[]> = {
  codex: [
    { label: "完全访问", flag: "--dangerously-bypass-approvals-and-sandbox" },
    { label: "联网搜索", flag: "--search" },
    { label: "保留终端滚动", flag: "--no-alt-screen" },
  ],
  claude_code: [
    { label: "完全访问", flag: "--dangerously-skip-permissions" },
    { label: "继续上次会话", flag: "--continue" },
    { label: "详细日志", flag: "--verbose" },
  ],
  opencode: [
    { label: "继续上次会话", flag: "--continue" },
    { label: "显示日志", flag: "--print-logs" },
  ],
  hermes: [
    { label: "完全访问", flag: "--yolo" },
    { label: "继续上次会话", flag: "--continue" },
    { label: "终端界面", flag: "--tui" },
  ],
};
// Retain the rest of the instruction, including quoted values and their spacing.
function flagTokens(instruction: string) {
  return [...instruction.matchAll(/"[^"\n]*"|'[^'\n]*'|\S+/g)];
}
function toggleFlag(instruction: string, flag: string) {
  const matches = flagTokens(instruction).filter((token) => token[0] === flag);
  if (!matches.length) return `${instruction.trimEnd()} ${flag}`;
  let next = instruction;
  for (const token of matches.reverse()) {
    const index = token.index!;
    next = next.slice(0, index) + next.slice(index + flag.length);
  }
  return next.trim();
}

export function AgentsPrototype({
  onInstalledCountChange,
}: { onInstalledCountChange?: (count: number) => void } = {}) {
  const { update: updateBackup, adopted } = useAgentSyncPrototype();
  const [agents, setAgents] = useState<PrototypeAgent[]>(initial);
  const [defaultAgent, setDefaultAgent] = useState("codex");
  const [showMore, setShowMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("installed");
  const [query, setQuery] = useState("");
  const [activeAgent, setActiveAgent] = useState("codex");
  useEffect(() => {
    updateBackup(launchDocument(agents, defaultAgent));
  }, [agents, defaultAgent, updateBackup]);
  useEffect(() => {
    if (!adopted) return;
    setAgents((all) =>
      all.map((agent) => ({
        ...agent,
        instruction: instructionFor(adopted, agent.key),
      })),
    );
    setDefaultAgent(adopted.default_agent);
  }, [adopted]);
  const installedCount = agents.filter((agent) => agent.installed).length;
  const enabledCount = agents.filter(
    (agent) => agent.enabled && agent.installed,
  ).length;
  const visible = agents.filter(
    (agent) =>
      (filter === "all" ||
        (filter === "installed"
          ? agent.installed
          : agent.enabled && agent.installed)) &&
      `${agent.display_name} ${agent.instruction}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );

  const customCount = agents.filter((agent) => agent.is_custom).length;
  const groups = [
    {
      key: "detected",
      title: "已检测到的智能体",
      items: visible.filter((agent) => agent.installed && !agent.is_custom),
    },
    {
      key: "other",
      title: "其他智能体",
      items: visible.filter((agent) => !agent.installed && !agent.is_custom),
    },
    {
      key: "custom",
      title: "自定义智能体",
      items: visible.filter((agent) => agent.is_custom),
    },
  ];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  useEffect(() => {
    onInstalledCountChange?.(installedCount);
  }, [installedCount, onInstalledCountChange]);
  const reorder = (event: DragEndEvent, keys: string[]) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = keys.indexOf(String(event.active.id)),
      to = keys.indexOf(String(event.over.id));
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(keys, from, to);
    let index = 0;
    setAgents((all) =>
      all.map((agent) =>
        keys.includes(agent.key)
          ? all.find((item) => item.key === reordered[index++])!
          : agent,
      ),
    );
    setNotice("智能体顺序已更新（仅原型）。");
  };
  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    window.setTimeout(() => {
      setAgents((all) =>
        all.map((agent) => ({
          ...agent,
          installed:
            initial.find((item) => item.key === agent.key)?.installed ??
            agent.installed,
        })),
      );
      setRefreshing(false);
      setNotice("安装状态已刷新（原型数据）；已编辑的配置和排序保留。");
    }, 450);
  };
  const [dark, setDark] = useState(
    document.documentElement.classList.contains("dark"),
  );
  const renderRow = (agent: PrototypeAgent, dragHandle?: ReactNode) => (
    <div
      className={`ap-agent-row ${agent.enabled ? "" : "ap-disabled"}`}
      key={agent.key}
    >
      <div className="ap-agent-name">
        {dragHandle}
        <AgentIcon agentKey={agent.key} className="h-7 w-7" />
        <div>
          <label htmlFor={`instruction-${agent.key}`}>
            {agent.display_name}
          </label>
          {!agent.installed && <span className="ap-not-installed">未安装</span>}
        </div>
      </div>
      <div className="ap-command-editor">
        <input
          id={`instruction-${agent.key}`}
          className="ap-instruction"
          aria-label={`${agent.display_name} 启动指令`}
          value={agent.instruction}
          placeholder={agent.installed ? "输入完整启动指令" : "配置启动指令…"}
          onFocus={() => setActiveAgent(agent.key)}
          spellCheck={false}
          onChange={(event) =>
            setAgents((all) =>
              all.map((item) =>
                item.key === agent.key
                  ? { ...item, instruction: event.target.value }
                  : item,
              ),
            )
          }
        />
        <div
          className="ap-shortcuts"
          role="group"
          aria-label={`${agent.display_name} 常用参数`}
        >
          {(activeAgent === agent.key ? (shortcuts[agent.key] ?? []) : []).map(
            (shortcut) => {
              const active = flagTokens(agent.instruction).some(
                (token) => token[0] === shortcut.flag,
              );
              return (
                <button
                  key={shortcut.flag}
                  className={
                    active ? "ap-shortcut ap-shortcut-active" : "ap-shortcut"
                  }
                  aria-pressed={active}
                  title={shortcut.flag}
                  onClick={() =>
                    setAgents((all) =>
                      all.map((item) =>
                        item.key === agent.key
                          ? {
                              ...item,
                              instruction: toggleFlag(
                                item.instruction,
                                shortcut.flag,
                              ),
                            }
                          : item,
                      ),
                    )
                  }
                >
                  {active ? <Check size={11} /> : <Plus size={11} />}
                  {shortcut.label}
                </button>
              );
            },
          )}
        </div>
        <AgentOriginalFields
          agent={agent}
          update={(patch) =>
            setAgents((all) =>
              all.map((item) =>
                item.key === agent.key ? { ...item, ...patch } : item,
              ),
            )
          }
          remove={() => {
            const remaining = agents.filter((item) => item.key !== agent.key);
            setAgents(remaining);
            setQuery("");
            setFilter("installed");
            if (defaultAgent === agent.key)
              setDefaultAgent(
                remaining.find((item) => item.installed && item.enabled)?.key ??
                  "",
              );
            setNotice(`已移除 ${agent.display_name}（仅原型）；技能目录保留。`);
          }}
        />
      </div>
      <div className="ap-actions">
        <ToggleSwitch
          title={`启用 ${agent.display_name}`}
          checked={agent.installed && agent.enabled}
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
        <button
          className={`ap-default ${defaultAgent === agent.key ? "ap-selected" : ""}`}
          disabled={!agent.installed || !agent.enabled}
          onClick={() => setDefaultAgent(agent.key)}
        >
          {defaultAgent === agent.key ? (
            <>
              <Check size={13} />
              默认
            </>
          ) : (
            "设为默认"
          )}
        </button>
      </div>
    </div>
  );
  const renderGroup = (items: PrototypeAgent[]) => (
    <div className="ap-sortable-group">
      <AgentGroupDnd
        items={items}
        sensors={sensors}
        dragLabel="拖动调整智能体顺序"
        onDragEnd={reorder}
        renderAgentCard={(tool, handle) => {
          const agent = items.find((item) => item.key === tool.key);
          return agent ? renderRow(agent, handle) : null;
        }}
      />
    </div>
  );
  return (
    <section className="ap-page">
      <header className="ap-heading">
        <div>
          <h2>智能体</h2>
          <p>直接编辑完整启动指令。所有智能体使用自身的默认模型。</p>
        </div>
        <button
          className="ap-icon-button"
          aria-label="切换主题"
          onClick={() => {
            document.documentElement.classList.toggle("dark");
            setDark(!dark);
          }}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>
      <AgentSyncPanel />
      <div className="ap-controls">
        <div className="ap-filters" role="group" aria-label="筛选智能体">
          {[
            { id: "installed", label: "已安装", count: installedCount },
            { id: "enabled", label: "已启用", count: enabledCount },
            { id: "all", label: "全部", count: agents.length },
          ].map((item) => (
            <button
              key={item.id}
              aria-pressed={filter === item.id}
              className={filter === item.id ? "ap-filter-selected" : ""}
              onClick={() => {
                setFilter(item.id);
                if (item.id === "all") setShowMore(true);
              }}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
        <div className="ap-search">
          <Search size={14} />
          <input
            aria-label="搜索智能体"
            placeholder="搜索所有 Agent…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value) setFilter("all");
            }}
          />
          {query && (
            <button aria-label="清空搜索" onClick={() => setQuery("")}>
              <X size={12} />
            </button>
          )}
        </div>
        <button className="ap-reset" onClick={() => setShowCustom(true)}>
          <Plus size={13} />
          添加自定义
        </button>
        <details className="ap-more">
          <summary role="button" aria-label="更多操作">
            更多
          </summary>
          <div>
            <button
              onClick={() =>
                setAgents((all) =>
                  all.map((agent) => ({ ...agent, enabled: true })),
                )
              }
            >
              全部启用
            </button>
            <button
              onClick={() =>
                setAgents((all) =>
                  all.map((agent) => ({ ...agent, enabled: false })),
                )
              }
            >
              全部禁用
            </button>
            <button
              disabled={refreshing}
              aria-busy={refreshing}
              onClick={refresh}
            >
              {refreshing ? "正在刷新…" : "刷新安装状态"}
            </button>
            <button
              onClick={() => {
                setAgents(initial);
                setDefaultAgent("codex");
                setNotice("");
              }}
            >
              重置演示
            </button>
          </div>
        </details>
      </div>
      <div className="ap-counts">
        已检测 {installedCount} / {agents.length}
        <span>已启用 {enabledCount}</span>
        <span>自定义 {customCount}</span>
      </div>
      {showCustom && (
        <AgentCustomForm
          close={() => setShowCustom(false)}
          add={(agent) => {
            setAgents((all) => [...all, agent]);
            setFilter("all");
            setShowCustom(false);
            setQuery(agent.display_name);
            setActiveAgent(agent.key);
          }}
        />
      )}
      <div className="ap-agent-list">
        {groups
          .filter((group) => group.items.length)
          .map((group) => (
            <section className="ap-agent-group" key={group.key}>
              {group.key === "other" ? (
                <details
                  open={showMore || !!query}
                  onToggle={(event) => setShowMore(event.currentTarget.open)}
                >
                  <summary role="button" aria-label="其他智能体">
                    {group.title}
                    <span>{group.items.length}</span>
                  </summary>
                  {renderGroup(group.items)}
                </details>
              ) : (
                <>
                  <header>
                    {group.title}
                    <span>{group.items.length}</span>
                  </header>
                  {renderGroup(group.items)}
                </>
              )}
            </section>
          ))}
      </div>
      {visible.length === 0 && (
        <div className="ap-empty">
          没有找到匹配的智能体
          <button
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            查看全部智能体
          </button>
        </div>
      )}
      {filter !== "all" && !query && (
        <button
          className="ap-show-all"
          onClick={() => {
            setFilter("all");
            setShowMore(true);
          }}
        >
          查看全部 {agents.length} 个智能体，包括未安装的 Agent
        </button>
      )}
      {notice && (
        <p role="status" className="ap-footnote">
          {notice}
        </p>
      )}
      <p className="ap-footnote">
        原型 · 保留项目全部 Agent
        字段。启动指令为预填配置，修改仅保留在当前页面。
      </p>
    </section>
  );
}
