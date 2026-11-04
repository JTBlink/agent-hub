import { useState } from "react";
import { ThemedSelect } from "../../../src/components/ThemedSelect";
import type { PreviewModel } from "./usePreviewModel";

const sessions = [
  {
    name: "default",
    running: true,
    workspaces: [
      {
        id: "web",
        label: "Web · ~/projects/web",
        agents: ["codex-1", "claude-1"],
      },
      { id: "docs", label: "Docs · ~/projects/docs", agents: ["codex-docs"] },
      { id: "empty", label: "Empty · ~/projects/empty", agents: [] },
    ],
  },
  {
    name: "review",
    running: true,
    workspaces: [
      {
        id: "review-web",
        label: "Web · ~/projects/web-review",
        agents: ["codex-1"],
      },
    ],
  },
  { name: "offline", running: false, workspaces: [] },
];

export function PrototypeDelivery({ model }: { model: PreviewModel }) {
  const [session, setSession] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [agent, setAgent] = useState("");
  const [copyOnly, setCopyOnly] = useState(false);
  const [failure, setFailure] = useState(false);
  const [error, setError] = useState("");
  const current = sessions.find((item) => item.name === session);
  const space = current?.workspaces.find((item) => item.id === workspace);
  const target = `${session} → ${space?.label} → ${agent}`;
  return (
    <div className="pv-modal-body">
      <p>{model.active?.title}</p>
      <p className="pv-subtle">{model.active?.url}</p>
      <p className="pv-subtle">
        {model.pageCaptures.length} 条批注 · {model.association}
      </p>
      <label className="pv-field">
        交付方式
        <ThemedSelect
          value={copyOnly ? "copy" : "herdr"}
          onChange={(event) => setCopyOnly(event.target.value === "copy")}
        >
          <option value="herdr">Herdr</option>
          <option value="copy">仅复制</option>
        </ThemedSelect>
      </label>
      {!copyOnly && (
        <>
          <label className="pv-field">
            Herdr 会话
            <ThemedSelect
              aria-label="Herdr 会话"
              value={session}
              onChange={(event) => {
                setSession(event.target.value);
                setWorkspace("");
                setAgent("");
                setError("");
              }}
            >
              <option value="">选择运行中的会话</option>
              {sessions.map((item) => (
                <option
                  key={item.name}
                  disabled={!item.running}
                  value={item.name}
                >
                  {item.name}
                  {!item.running && " · 未运行"}
                </option>
              ))}
            </ThemedSelect>
          </label>
          <label className="pv-field">
            工作空间
            <ThemedSelect
              aria-label="工作空间"
              value={workspace}
              disabled={!current}
              onChange={(event) => {
                setWorkspace(event.target.value);
                setAgent("");
                setError("");
              }}
            >
              <option value="">选择工作空间</option>
              {current?.workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </ThemedSelect>
          </label>
          <label className="pv-field">
            具体 Agent
            <ThemedSelect
              aria-label="具体 Agent"
              value={agent}
              disabled={!space}
              onChange={(event) => setAgent(event.target.value)}
            >
              <option value="">选择 Agent</option>
              {space?.agents.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </ThemedSelect>
          </label>
          {space && !space.agents.length && (
            <p role="status">没有 Agent，请先在 Herdr 启动。</p>
          )}
          {agent && <p role="status">发送至：{target}</p>}
        </>
      )}
      {model.pageCaptures.map((item) => (
        <article key={item.id}>
          <strong>{item.selector}</strong>
          <p>{item.note || "未填写批注"}</p>
          <p className="pv-subtle">
            {item.screenshot
              ? `元素截图 · ${item.width} × ${item.height}`
              : "未附截图"}
          </p>
        </article>
      ))}
      <label className="pv-field">
        将要交付的上下文
        <textarea
          rows={8}
          value={model.prompt}
          onChange={(event) => model.setPrompt(event.target.value)}
        />
      </label>
      <p className="pv-note">
        原型使用合成会话，只投递到右侧沙盒。正式模块复用 Herdr 投递接口；Agent
        修改完成后刷新预览检查结果。
      </p>
      <label>
        <input
          type="checkbox"
          checked={failure}
          onChange={(event) => setFailure(event.target.checked)}
        />
        模拟发送失败
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        className="pv-primary"
        disabled={!model.prompt.trim() || (!copyOnly && !agent)}
        onClick={() => {
          if (failure && !copyOnly) {
            setError("发送失败，批注已保留。请检查目标后重试。");
            return;
          }
          if (copyOnly) void model.copy(model.prompt);
          else {
            model.setAgentLog((previous) => [
              ...previous,
              `→ ${target}\n${model.prompt}`,
              "演示交付完成。真实 Agent 修改完成后，请刷新预览验收。",
            ]);
            model.switchVariant("C");
            model.notify("已交付到演示区；待修改后刷新预览检查结果");
          }
          model.setModal(null);
        }}
      >
        {copyOnly ? "复制上下文" : "交付到演示区"}
      </button>
    </div>
  );
}
