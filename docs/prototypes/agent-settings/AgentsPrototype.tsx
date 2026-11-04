// Throwaway: compare global Agent default settings in cards, master/detail and table layouts.
// No model override and no real mutations; every edit stays in memory.
import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Terminal,
  RotateCcw,
  Settings2,
  Sun,
  Moon,
  X,
  Plus,
} from "lucide-react";
import { AgentIcon } from "../../../src/components/AgentIcon";
import { ThemedSelect } from "../../../src/components/ThemedSelect";
import { ToggleSwitch } from "../../../src/components/ToggleSwitch";
import "./agents-prototype.css";

type Agent = {
  key: string;
  name: string;
  command: string;
  home: string;
  enabled: boolean;
  effort: string;
  permission: string;
  args: string[];
  environment: string;
};
const initial: Agent[] = [
  {
    key: "codex",
    name: "Codex",
    command: "codex",
    home: "~/.codex",
    enabled: true,
    effort: "default",
    permission: "inherit",
    args: [],
    environment: "default",
  },
  {
    key: "claude_code",
    name: "Claude Code",
    command: "claude",
    home: "~/.claude",
    enabled: true,
    effort: "default",
    permission: "inherit",
    args: [],
    environment: "default",
  },
  {
    key: "opencode",
    name: "OpenCode",
    command: "opencode",
    home: "~/.config/opencode",
    enabled: true,
    effort: "default",
    permission: "inherit",
    args: [],
    environment: "default",
  },
  {
    key: "hermes",
    name: "Hermes Agent",
    command: "hermes",
    home: "~/.hermes",
    enabled: false,
    effort: "default",
    permission: "inherit",
    args: [],
    environment: "default",
  },
];
const names = ["展开卡片", "列表与详情", "紧凑表格"];
function launchCommand(agent: Agent) {
  const permission =
    agent.permission === "inherit" || agent.permission === "full";
  const flags = permission
    ? agent.key === "codex"
      ? ["--dangerously-bypass-approvals-and-sandbox"]
      : agent.key === "claude_code"
        ? ["--dangerously-skip-permissions"]
        : []
    : [];
  return [agent.command, ...flags, ...agent.args].filter(Boolean).join(" ");
}
function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="ap-field">
      <div className="ap-field-title">{label}</div>
      <div className="ap-field-body">
        {children}
        {help && <p className="ap-help">{help}</p>}
      </div>
    </div>
  );
}
function Editor({
  agent,
  update,
}: {
  agent: Agent;
  update: (patch: Partial<Agent>) => void;
}) {
  const [argument, setArgument] = useState("");
  const add = () => {
    if (argument.trim()) {
      update({ args: [...agent.args, argument.trim()] });
      setArgument("");
    }
  };
  return (
    <div className="ap-editor">
      <Field label="命令">
        <input
          aria-label="命令"
          value={agent.command}
          onChange={(e) => update({ command: e.target.value })}
          spellCheck={false}
        />
      </Field>
      <Field label="推理强度">
        <ThemedSelect
          aria-label="推理强度"
          value={agent.effort}
          onChange={(e) => update({ effort: e.target.value })}
        >
          <option value="default">使用智能体默认值</option>
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
        </ThemedSelect>
      </Field>
      <Field label="权限">
        <ThemedSelect
          aria-label="权限"
          value={agent.permission}
          onChange={(e) => update({ permission: e.target.value })}
        >
          <option value="inherit">跟随全局 · 完全访问</option>
          <option value="standard">标准权限</option>
          <option value="full">完全访问</option>
        </ThemedSelect>
      </Field>
      <Field label="额外参数">
        <div className="ap-arguments">
          {agent.args.map((arg, index) => (
            <span className="ap-token" key={index}>
              {arg}
              <button
                aria-label={`删除参数 ${arg}`}
                onClick={() =>
                  update({ args: agent.args.filter((_, i) => i !== index) })
                }
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            aria-label="添加参数"
            value={argument}
            placeholder={
              agent.args.length
                ? "添加参数…"
                : "无额外参数，输入后按 Enter 添加"
            }
            onChange={(e) => setArgument(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            onBlur={add}
          />
        </div>
      </Field>
      <Field label="环境">
        <ThemedSelect
          aria-label="环境"
          value={agent.environment}
          onChange={(e) => update({ environment: e.target.value })}
        >
          <option value="default">使用系统默认环境</option>
          <option value="development">开发环境</option>
          <option value="clean">干净环境</option>
        </ThemedSelect>
      </Field>
      <Field label="智能体主目录" help="留空时使用智能体自身的默认目录。">
        <input
          aria-label="智能体主目录"
          value={agent.home}
          onChange={(e) => update({ home: e.target.value })}
          spellCheck={false}
        />
      </Field>
      <div className="ap-command">
        <Terminal size={14} />
        <code>{launchCommand(agent)}</code>
      </div>
    </div>
  );
}
export function AgentsPrototype() {
  const [agents, setAgents] = useState(initial);
  const [defaultKey, setDefaultKey] = useState("codex");
  const [selected, setSelected] = useState("codex");
  const [expanded, setExpanded] = useState("codex");
  const [variant, setVariant] = useState(() => {
    const value = new URLSearchParams(location.search).get("variant") ?? "A";
    const index = ["A", "B", "C"].indexOf(value);
    return index >= 0 ? index : Math.max(0, Math.min(2, Number(value) || 0));
  });
  const [dark, setDark] = useState(
    document.documentElement.classList.contains("dark"),
  );
  const [toast, setToast] = useState("");
  const [inspect, setInspect] = useState(false);
  const update = (key: string, patch: Partial<Agent>) =>
    setAgents((all) =>
      all.map((a) => (a.key === key ? { ...a, ...patch } : a)),
    );
  const current = agents.find((a) => a.key === selected)!;
  const cycle = (step: number) => setVariant((v) => (v + step + 3) % 3);
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("variant", String.fromCharCode(65 + variant));
    history.replaceState({}, "", url);
    console.info("Agent settings prototype state", {
      variant: names[variant],
      defaultAgent: defaultKey,
      agents,
    });
  }, [variant, defaultKey, agents]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,[contenteditable],[role=combobox]",
        )
      )
        return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(timer);
  }, [toast]);
  const defaultButton = (agent: Agent) => (
    <button
      className={`ap-default ${defaultKey === agent.key ? "is-default" : ""}`}
      disabled={!agent.enabled}
      onClick={() => {
        setDefaultKey(agent.key);
        setToast(`默认智能体已切换为 ${agent.name}（仅原型）`);
      }}
    >
      {defaultKey === agent.key ? (
        <>
          <Check size={13} />
          默认
        </>
      ) : (
        "设为默认"
      )}
    </button>
  );
  const toolbar = (agent: Agent) => (
    <div className="ap-actions">
      <ToggleSwitch
        checked={agent.enabled}
        title={`启用 ${agent.name}`}
        onChange={() => update(agent.key, { enabled: !agent.enabled })}
      />
      {defaultButton(agent)}
    </div>
  );
  return (
    <div className="ap-page">
      <div className="ap-heading">
        <div>
          <h2>智能体</h2>
          <p>配置各智能体的默认启动方式，用于终端与定时任务。</p>
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
      </div>
      <div className="ap-global">
        <div>
          <span className="ap-dot" />
          默认智能体{" "}
          <strong>{agents.find((a) => a.key === defaultKey)?.name}</strong>
          <span className="ap-global-note">所有智能体均使用自身的默认模型</span>
        </div>
        <button
          onClick={() => {
            setAgents(initial);
            setDefaultKey("codex");
            setToast("已恢复原型初始设置");
          }}
        >
          <RotateCcw size={13} />
          恢复默认
        </button>
      </div>
      <div className="ap-list-toolbar">
        <span>
          已安装 <b>4</b>
          <span className="ap-toolbar-separator" />
          已启用 <b>{agents.filter((a) => a.enabled).length}</b>
        </span>
        <button
          onClick={() => setToast("自定义智能体入口示意；本原型使用演示数据")}
        >
          <Plus size={14} />
          添加智能体
        </button>
      </div>
      {variant === 0 && (
        <div className="ap-cards">
          {agents.map((agent) => (
            <section
              className={`ap-card ${agent.enabled ? "" : "is-disabled"}`}
              key={agent.key}
            >
              <header>
                <button
                  className="ap-identity"
                  aria-expanded={expanded === agent.key}
                  onClick={() =>
                    setExpanded(expanded === agent.key ? "" : agent.key)
                  }
                >
                  <AgentIcon agentKey={agent.key} className="h-8 w-8" />
                  <span>
                    <strong>{agent.name}</strong>
                    <code>{launchCommand(agent)}</code>
                  </span>
                </button>
                {toolbar(agent)}
                <button
                  className="ap-icon-button"
                  aria-label={`展开 ${agent.name}`}
                  onClick={() =>
                    setExpanded(expanded === agent.key ? "" : agent.key)
                  }
                >
                  <ChevronDown
                    size={16}
                    style={{
                      transform:
                        expanded === agent.key ? "rotate(180deg)" : "none",
                    }}
                  />
                </button>
              </header>
              {expanded === agent.key && (
                <Editor
                  agent={agent}
                  update={(patch) => update(agent.key, patch)}
                />
              )}
            </section>
          ))}
        </div>
      )}
      {variant === 1 && (
        <div className="ap-master-detail">
          <nav className="ap-agent-nav" aria-label="选择智能体">
            {agents.map((agent) => (
              <button
                className={selected === agent.key ? "selected" : ""}
                key={agent.key}
                onClick={() => setSelected(agent.key)}
              >
                <AgentIcon agentKey={agent.key} className="h-8 w-8" />
                <span>
                  <strong>{agent.name}</strong>
                  <small>
                    {defaultKey === agent.key
                      ? "默认智能体"
                      : agent.enabled
                        ? "已启用"
                        : "已禁用"}
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </nav>
          <section className="ap-detail">
            <header>
              <h3>{current.name}</h3>
              {toolbar(current)}
            </header>
            <Editor
              agent={current}
              update={(patch) => update(current.key, patch)}
            />
          </section>
        </div>
      )}
      {variant === 2 && (
        <div className="ap-table-layout">
          <div className="ap-table">
            <div className="ap-table-head">
              <span>智能体</span>
              <span>命令</span>
              <span>状态</span>
              <span>默认</span>
            </div>
            {agents.map((agent) => (
              <div
                role="button"
                tabIndex={0}
                className={`ap-table-row ${selected === agent.key ? "selected" : ""}`}
                key={agent.key}
                onClick={() => setSelected(agent.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelected(agent.key);
                }}
              >
                <span>
                  <AgentIcon agentKey={agent.key} className="h-6 w-6" />
                  <strong>{agent.name}</strong>
                </span>
                <code>{agent.command}</code>
                <span>{agent.enabled ? "已启用" : "已禁用"}</span>
                <span>{defaultKey === agent.key && <Check size={15} />}</span>
              </div>
            ))}
          </div>
          <section className="ap-detail">
            <header>
              <h3>
                <Settings2 size={16} />
                {current.name} 设置
              </h3>
              {defaultButton(current)}
            </header>
            <div className="ap-detail-tools">{toolbar(current)}</div>
            <Editor
              agent={current}
              update={(patch) => update(current.key, patch)}
            />
          </section>
        </div>
      )}
      <div className="ap-page-foot">
        <span>原型 · 修改仅保留在当前页面</span>
        <button onClick={() => setInspect(!inspect)}>
          {inspect ? "收起状态" : "查看当前配置"}
        </button>
      </div>
      {inspect && (
        <pre className="ap-state">
          {JSON.stringify({ defaultAgent: defaultKey, agents }, null, 2)}
        </pre>
      )}
      {toast && (
        <div role="status" className="ap-toast">
          <Check size={15} />
          {toast}
        </div>
      )}
      <div className="ap-switcher">
        <span>布局原型</span>
        <button aria-label="上一个方案" onClick={() => cycle(-1)}>
          <ChevronLeft size={16} />
        </button>
        <strong>
          {String.fromCharCode(65 + variant)} · {names[variant]}
        </strong>
        <button aria-label="下一个方案" onClick={() => cycle(1)}>
          <ChevronRight size={16} />
        </button>
        <span className="ap-dots">
          {names.map((_, i) => (
            <button
              key={i}
              aria-label={`方案 ${String.fromCharCode(65 + i)}`}
              className={i === variant ? "active" : ""}
              onClick={() => setVariant(i)}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
