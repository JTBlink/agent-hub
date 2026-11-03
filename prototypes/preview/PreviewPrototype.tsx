import {
  Send,
  Check,
  Layers,
  Terminal,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "./prototypeShared";
import { variants } from "./previewFormat";
import { PrototypeLibrary } from "./PrototypeLibrary";
import { PrototypeToolbar } from "./PrototypeToolbar";
import { PrototypePage } from "./PrototypePage";
import { PrototypeInspector } from "./PrototypeInspector";
import { PrototypeDialogs } from "./PrototypeDialogs";
import { usePreviewModel } from "./usePreviewModel";
export function PreviewPrototype() {
  const model = usePreviewModel();
  const {
    variant,
    modal,
    tabs,
    panelOpen,
    picking,
    hover,
    captures,
    source,
    mobile,
    toast,
    dark,
    setDark,
    prompt,
    setPrompt,
    agentLog,
    setAgentLog,
    association,
    fileInput,
    cookieInput,
    active,
    notify,
    cycleVariant,
    openPanel,
    importFile,
  } = model;
  return (
    <div className={`pv-app variant-${variant}`}>
      <header className="pv-titlebar" inert={modal !== null}>
        <div className="pv-brand">
          <Layers size={18} />
          <strong>AgentHub</strong>
          <span>/</span>
          <span>预览与浏览</span>
        </div>
        <span className="pv-prototype-label">交互原型 · 外部操作为演示</span>
        <Button
          label={dark ? "浅色主题" : "深色主题"}
          onClick={() => setDark(!dark)}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
      </header>
      <div className="pv-shell" inert={modal !== null}>
        <PrototypeLibrary model={model} />
        <main className="pv-main">
          <PrototypeToolbar model={model} />
          <div className="pv-workarea">
            <PrototypePage model={model} />
            {panelOpen && (
              <aside className="pv-inspector">
                <PrototypeInspector model={model} />
              </aside>
            )}
            {variant === "C" && (
              <aside className="pv-agent">
                <div className="pv-panel-heading">
                  <h2>
                    <Terminal size={16} />
                    Agent 工作区
                  </h2>
                  <span className="pv-badge">沙盒演示</span>
                </div>
                <div className="pv-agent-log">
                  <p className="pv-subtle">
                    在这里预览交付结果与后续反馈。原型不会启动或向真实 Agent
                    投递。
                  </p>
                  {agentLog.map((line, index) => (
                    <pre key={index}>{line}</pre>
                  ))}
                  {!agentLog.length && (
                    <div className="pv-empty">
                      <Send size={28} />
                      <h3>从页面到修改</h3>
                      <p>添加批注，再点击「交给 Agent」。</p>
                    </div>
                  )}
                </div>
                <div className="pv-agent-bottom">
                  <textarea
                    aria-label="Agent 消息草稿"
                    placeholder="补充说明…"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                  />
                  <button
                    className="pv-primary"
                    disabled={!prompt.trim()}
                    onClick={() => {
                      setAgentLog((previous) => [
                        ...previous,
                        `用户草稿：${prompt}`,
                        "演示已接收；未执行真实任务。",
                      ]);
                      setPrompt("");
                    }}
                  >
                    发送到演示区
                  </button>
                </div>
              </aside>
            )}
          </div>
          <footer className="pv-status">
            <span>
              <span className="pv-status-dot" />
              {active
                ? `${active.kind === "markdown" ? "Markdown" : active.kind === "html" ? "HTML" : "网页"} · ${source ? "源码" : "预览"}`
                : "就绪"}
            </span>
            <span>
              {mobile ? "390 × 844" : "自适应视口"}{" "}
              <span className="pv-status-divider">/</span> {association}
            </span>
            <button onClick={() => openPanel("capabilities")}>
              原型状态：{tabs.length} 标签 · {captures.length} 批注
            </button>
          </footer>
        </main>
      </div>
      {hover && picking && (
        <div
          className="pv-selection"
          style={{
            left: hover.x,
            top: hover.y,
            width: hover.w,
            height: hover.h,
          }}
        >
          <span>{hover.label}</span>
        </div>
      )}
      {import.meta.env.DEV && (
        <div className="pv-variant-switcher" inert={modal !== null}>
          <button aria-label="上一个方案" onClick={() => cycleVariant(-1)}>
            <ChevronLeft size={16} />
          </button>
          <span>
            方案 {variant}
            <strong>{variants[variant]}</strong>
          </span>
          <button aria-label="下一个方案" onClick={() => cycleVariant(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div role="status" className="pv-toast">
          <Check size={15} />
          {toast}
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".md,.markdown,.html,.htm"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = "";
        }}
      />
      <input
        ref={cookieInput}
        type="file"
        accept="application/json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 1024 * 1024) {
            notify("Cookie 文件超过 1 MiB");
            return;
          }
          try {
            const value: unknown = JSON.parse(await file.text());
            notify(
              Array.isArray(value)
                ? `已读取 ${value.length} 条 Cookie 结构；未导入真实会话`
                : "需要 Cookie 数组格式",
            );
          } catch {
            notify("无法解析 JSON 文件");
          }
        }}
      />
      <PrototypeDialogs model={model} />
    </div>
  );
}
