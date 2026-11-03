// Production components with synthetic IPC. Native browser behavior is tested in Rust.
import ReactDOM from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { PreviewWorkspace } from "../../src/features/preview/PreviewWorkspace";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/index.css";
const parameters = new URLSearchParams(location.search);
document.documentElement.classList.toggle(
  "dark",
  parameters.get("theme") !== "light",
);
const content =
  "# Preview workspace\n\n## Working document\n\nSelect this paragraph to keep its source location.\n\n```md\n## Code is not an outline heading\n```\n\n## Working document\n\n| Feature | State |\n| --- | --- |\n| Markdown | Ready |\n";
mockIPC((command, args) => {
  if (command === "preview_pick_document")
    return {
      id: "fixture",
      kind: "markdown",
      title: "guide.md",
      content,
      revision: "saved",
      url: "http://127.0.0.1:4176/fixture/guide.md",
    };
  if (command === "preview_request") {
    const request = args?.request as { kind: string; content?: string };
    if (request.kind === "info")
      return {
        executable: null,
        profiles: [{ id: "default", name: "Default" }],
      };
    if (request.kind === "list" || request.kind === "downloads") return [];
    if (request.kind === "save_document")
      return {
        id: "fixture",
        kind: "markdown",
        title: "guide.md",
        content: request.content,
        revision: "new",
      };
  }
  if (command === "get_settings")
    return args?.key === "language"
      ? (parameters.get("language") ?? "zh")
      : null;
  if (command === "herdr_inventory") return { installed: false, sessions: [] };
  return null;
});
localStorage.removeItem("agent-hub.preview.tabs.v1");
applyTextSize(parameters.get("text-size") ?? "default");
const { i18nReady } = await import("../../src/i18n");
await i18nReady;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <div style={{ height: "calc(100vh / var(--app-scale, 1))", display: "flex" }}>
    <PreviewWorkspace shown />
  </div>,
);
