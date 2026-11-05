import { Eye, Send } from "lucide-react";
import type { PreviewModel } from "./usePreviewModel";
import { captureText } from "./previewFormat";

/** Synthetic transport; the visible packet and the sandbox receive the same text. */
export function PrototypeDelivery({ model }: { model: PreviewModel }) {
  const { active, pageCaptures, prompt, setPrompt, agentTabs, setAgentTabs } =
    model;
  const path =
    active?.kind === "web"
      ? undefined
      : `/workspace${decodeURIComponent(new URL(active?.url ?? "workspace:///untitled").pathname)}`;
  const identity = path ?? active?.url ?? "";
  const name = path?.split("/").at(-1) ?? active?.title ?? "";
  const messages = agentTabs[identity] ?? [];
  const packet = [
    `# ${name}`,
    path ? `File: ${path}` : `URL: ${identity}`,
    captureText(pageCaptures).replaceAll(/URL: [^\n]*\n/g, ""),
    prompt.trim() ? `# Requested changes\n\n${prompt.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const send = () => {
    if (!prompt.trim() && !pageCaptures.length) return;
    setAgentTabs((previous) => ({
      ...previous,
      [identity]: [...(previous[identity] ?? []), packet],
    }));
    model.notify(
      messages.length
        ? `已追加到 ${name}，复用上下文（演示）`
        : `已创建 ${name} Agent Tab（演示）`,
    );
  };
  return (
    <div className="pv-delivery-composer">
      <textarea
        aria-label="修改要求"
        placeholder="希望怎么改？⌘/Ctrl + Enter 发送"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            send();
          }
        }}
      />
      <details className="pv-delivery-preview">
        <summary>
          <Eye size={13} />
          查看完整发送内容
        </summary>
        <div>
          <p>{path ?? identity}</p>
          <p>
            目标 Tab：{name} ·{" "}
            {messages.length ? "复用已有上下文" : "首次发送时创建"}
          </p>
          <pre>{packet}</pre>
          {pageCaptures
            .filter((item) => item.screenshot)
            .map((item) => (
              <p key={item.id}>
                附加截图：{item.selector} · {item.width} × {item.height}
                （位图演示）
              </p>
            ))}
        </div>
      </details>
      <div className="pv-delivery-actions">
        <span title={identity}>Tab：{name}</span>
        <button
          className="pv-primary"
          disabled={!prompt.trim() && !pageCaptures.length}
          onClick={send}
        >
          <Send size={14} />
          发送给 Agent
        </button>
      </div>
      {!!messages.length && (
        <details className="pv-delivery-preview">
          <summary>
            {name} · {messages.length} 条消息（演示 Tab）
          </summary>
          <div>
            {messages.map((message, index) => (
              <pre key={index}>{message}</pre>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
