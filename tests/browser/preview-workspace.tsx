// Production components with synthetic IPC. Native browser behavior is tested in Rust.
import { useState } from "react";
import { CookieImportPanel } from "../../src/features/preview/components/CookieImportPanel";
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
  "# Preview workspace\n\n## Working document\n\nSelect this paragraph to keep its source location.\nThis continuation belongs to the same paragraph.\n\n```md\n## Code is not an outline heading\n```\n\n## Working document\n\n| Feature | State |\n| --- | --- |\n| Markdown | Ready |\n";
mockIPC((command, args) => {
  if (command === "plugin:clipboard-manager|write_text") {
    document.documentElement.dataset.copiedContext = String(args?.text ?? "");
    return null;
  }
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
    const request = args?.request;
    if (!request || typeof request !== "object" || !("kind" in request))
      return null;
    if (request.kind === "info")
      return {
        executable: null,
        profiles: [{ id: "default", name: "Default" }],
      };
    if (request.kind === "cookie_prepare")
      return {
        id: "fixture-import",
        target: {
          id: "fixture-page",
          profile: "default",
          profile_name: "Default",
          revision: "fixture-revision",
          title: "Cookie scope",
          url: "https://example.invalid",
        },
        domains: { "one.example.invalid": 1, "two.example.invalid": 1 },
        total: 2,
        importable: 2,
        skipped: { invalid: 0, expired: 0, partitioned: 0, bound: 0 },
      };
    if (request.kind === "cookie_apply") return { imported: 1, removed: 0 };
    if (request.kind === "list" || request.kind === "downloads") return [];
    if (request.kind === "save_document")
      return {
        id: "fixture",
        kind: "markdown",
        title: "guide.md",
        content: "content" in request ? request.content : "",
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
    {parameters.get("view") === "cookies" ? (
      <CookieFixture />
    ) : (
      <PreviewWorkspace shown />
    )}
  </div>,
);

export function CookieFixture() {
  const [notice, setNotice] = useState("");
  return (
    <section className="preview-workspace">
      <aside
        className="preview-inspector"
        style={{ width: "100%", height: "100%" }}
      >
        <div className="preview-inspector-scroll">
          <CookieImportPanel
            pageId="fixture-page"
            address="https://example.invalid"
            revision="fixture-revision"
            onError={() => setNotice("Import error")}
            onImported={() => setNotice("Imported")}
          />
          <p role="status">{notice}</p>
        </div>
      </aside>
    </section>
  );
}
