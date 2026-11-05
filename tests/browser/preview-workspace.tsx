import { herdrDeliveryAdapter } from "../../src/features/herdr/deliveryAdapter";
import { BrowserSurface } from "../../src/features/preview/web/BrowserSurface";
import { DownloadsPanel } from "../../src/features/preview/components/DownloadsPanel";
import type {
  PreviewDownload,
  BrowserPageInfo,
} from "../../src/features/preview/api";
// Production components with synthetic IPC. Native browser behavior is tested in Rust.
import { useState } from "react";
import { CookieImportPanel } from "../../src/features/preview/components/CookieImportPanel";
import ReactDOM from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { PreviewWorkspace } from "../../src/features/preview/PreviewWorkspace";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/index.css";
const parameters = new URLSearchParams(location.search);
// Background browser acceptance tabs model the active production surface for polling.
if (["recovery", "execution"].includes(parameters.get("view") ?? ""))
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => false,
  });
document.documentElement.classList.toggle(
  "dark",
  parameters.get("theme") !== "light",
);
const content =
  "# Preview workspace\n\n## Working document\n\nSelect this paragraph to keep its source location.\nThis continuation belongs to the same paragraph.\n\n```md\n## Code is not an outline heading\n```\n\n## Working document\n\n| Feature | State |\n| --- | --- |\n| Markdown | Ready |\n";
let linkDestination = "system";
const executionPages = new Map<string, BrowserPageInfo>();
let executionCreated = 0;
let executionClosed = 0;
const executionSnapshot = () => {
  document.documentElement.dataset.executionPages = JSON.stringify([
    ...executionPages.values(),
  ]);
  document.documentElement.dataset.executionClosed = String(executionClosed);
};
let disconnected = true;
let fetchAttempts = 0;
let remoteDownload: PreviewDownload = {
  id: "remote-artifact",
  profile: "remote",
  name: "server-artifact.bin",
  state: "completed",
  received: 1024,
  total: 1024,
  remote: true,
  local: false,
  verified: true,
};
let downloads: PreviewDownload[] = [
  {
    id: "completed",
    profile: "default",
    name: "report.txt",
    state: "completed",
    received: 1024,
    total: 1024,
    local: true,
    verified: true,
  },
  {
    id: "active",
    profile: "guest",
    name: "pending.txt",
    state: "inProgress",
    received: 500,
    total: 2000,
    local: true,
    verified: false,
  },
];
mockIPC((command, args) => {
  if (command === "plugin:clipboard-manager|write_text") {
    document.documentElement.dataset.copiedContext = String(args?.text ?? "");
    return null;
  }
  if (command === "plugin:opener|open_url") {
    document.documentElement.dataset.openedResource = String(args?.url ?? "");
    return null;
  }
  if (command === "set_settings" && args?.key === "preview_link_destination") {
    linkDestination = String(args?.value);
    return null;
  }
  if (command === "preview_pick_document")
    return {
      id: "fixture",
      kind: "markdown",
      title: "guide.md",
      path: "/workspace/site/guide.md",
      content: content + "\n[Linked guide](next.md?mode=read#target)\n",
      revision: "saved",
      url: "http://127.0.0.1:4176/fixture/guide.md",
    };
  if (command === "preview_request") {
    const request = args?.request;
    if (!request || typeof request !== "object" || !("kind" in request))
      return null;
    if (request.kind === "capture_rendered") {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 600;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "white";
      context.fillRect(0, 0, 800, 600);
      context.fillStyle = "black";
      context.fillText("Synthetic preview", 30, 30);
      return canvas.toDataURL("image/png").split(",")[1];
    }
    if (request.kind === "kernel")
      return {
        product: "Chrome/156.0.0.0",
        userAgent:
          "Mozilla/5.0 (Synthetic preview) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36",
        protocolVersion: "1.3",
      };
    if (
      request.kind === "action" &&
      "action" in request &&
      request.action &&
      typeof request.action === "object" &&
      "kind" in request.action &&
      request.action.kind === "devtools"
    ) {
      document.documentElement.dataset.devtoolsTarget = String(
        "id" in request ? request.id : "",
      );
      return null;
    }
    if (parameters.get("view") === "execution") {
      if (
        request.kind === "prepare_delivery" &&
        "text" in request &&
        "images" in request
      ) {
        document.documentElement.dataset.packagedContext =
          JSON.stringify(request);
        return { prompt: request.text, context: request.text, attachments: [] };
      }
      if (request.kind === "info")
        return {
          executable: null,
          profiles: [
            { id: "default", name: "Device" },
            {
              id: "remote",
              name: "External",
              endpoint: "http://127.0.0.1:9222",
            },
            { id: "proxy", name: "Proxy", proxy: "socks5://127.0.0.1:1080" },
          ],
        };
      if (
        request.kind === "create" &&
        "profile" in request &&
        typeof request.profile === "string" &&
        "url" in request &&
        typeof request.url === "string"
      ) {
        const id = `execution-${++executionCreated}`;
        executionPages.set(id, {
          id,
          status: "connected",
          profile: request.profile,
          url: request.url,
          title: `Page ${request.profile}`,
          revision: id,
          execution: {
            render: request.profile === "remote" ? "server" : "client",
            network:
              request.profile === "remote"
                ? "server_default"
                : request.profile === "proxy"
                  ? "proxy"
                  : "client_default",
          },
        });
        executionSnapshot();
        return id;
      }
      if (
        request.kind === "close" &&
        "id" in request &&
        typeof request.id === "string"
      ) {
        executionPages.delete(request.id);
        executionClosed += 1;
        executionSnapshot();
        return null;
      }
      if (request.kind === "list") return [...executionPages.values()];
      if (
        request.kind === "frame" &&
        "id" in request &&
        typeof request.id === "string"
      ) {
        const page = executionPages.get(request.id);
        if (!page) throw Error("Page unavailable");
        return {
          version: 1,
          image:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a5sAAAAASUVORK5CYII=",
          events: [],
          info: {
            ...page,
            ready: "complete",
            width: 800,
            height: 600,
            scrollX: 0,
            scrollY: 0,
            dpr: 1,
          },
        };
      }
      if (request.kind === "action") return null;
    }
    if (request.kind === "frame" && parameters.get("view") === "recovery") {
      if (disconnected) throw new Error("Disconnected");
      return {
        version: 2,
        image:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a5sAAAAASUVORK5CYII=",
        events: [],
        info: {
          url: "https://example.invalid",
          title: "Recovery fixture",
          revision: "connected",
          ready: "complete",
          width: 800,
          height: 600,
          scrollX: 0,
          scrollY: 0,
          dpr: 1,
        },
      };
    }
    if (request.kind === "reconnect" || request.kind === "reopen") {
      document.documentElement.dataset.recoveryAction = request.kind;
      disconnected = false;
      return null;
    }
    if (request.kind === "resource_link")
      return "http://fixture.agent-hub.localhost:4176/next.md?mode=read#target";
    if (request.kind === "open_link")
      return {
        kind: "document",
        document: {
          id: "linked-fixture",
          kind: "markdown",
          title: "next.md",
          revision: "saved",
          content:
            "# Linked guide\n\n" +
            "A long paragraph before the anchor.\n\n".repeat(80) +
            "## Target\n\nAnchor destination.",
          url: "http://127.0.0.1:4176/linked-fixture/next.md?mode=read#target",
        },
      };
    if (request.kind === "save_profile") {
      document.documentElement.dataset.savedRemoteProfile = JSON.stringify(
        "profile" in request ? request.profile : null,
      );
      return null;
    }
    if (
      request.kind === "prepare_delivery" &&
      "text" in request &&
      "images" in request
    ) {
      document.documentElement.dataset.packagedContext =
        JSON.stringify(request);
      return { prompt: request.text, context: request.text, attachments: [] };
    }
    if (request.kind === "info")
      return {
        executable: null,
        profiles:
          parameters.get("view") === "remote-settings"
            ? [
                {
                  id: "remote",
                  name: "Remote",
                  endpoint: "http://127.0.0.1:9222",
                  remote_download_directory: "/srv/downloads",
                  remote_transfer_target: "browser-host",
                },
              ]
            : [{ id: "default", name: "Default" }],
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
    if (request.kind === "fetch_download") {
      fetchAttempts += 1;
      remoteDownload =
        fetchAttempts === 1
          ? { ...remoteDownload, transfer: { state: "running", received: 512 } }
          : {
              ...remoteDownload,
              local: true,
              transfer: { state: "completed", received: 1024 },
            };
      return null;
    }
    if (request.kind === "cancel_transfer") {
      remoteDownload = {
        ...remoteDownload,
        transfer: { state: "canceled", received: 512 },
      };
      return null;
    }
    if (request.kind === "downloads")
      return parameters.get("view") === "remote-downloads"
        ? [remoteDownload]
        : parameters.get("view") === "downloads"
          ? downloads
          : [];
    if (
      request.kind === "forget_download" &&
      "id" in request &&
      "profile" in request
    ) {
      downloads = downloads.filter(
        (item) => item.id !== request.id || item.profile !== request.profile,
      );
      return null;
    }
    if (request.kind === "list") return [];
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
      : args?.key === "preview_link_destination"
        ? linkDestination
        : null;
  if (command === "herdr_inventory")
    return {
      installed: true,
      sessions: [{ name: "default", running: true }],
    };
  if (command === "herdr_snapshot")
    return {
      workspaces: [
        {
          workspace_id: "site",
          label: "Website",
          directory: "/workspace/site",
          active_tab_id: "tab",
        },
      ],
      agents: [
        {
          workspace_id: "site",
          pane_id: "agent",
          tab_id: "tab",
          terminal_id: "terminal",
          revision: 1,
          cwd: "/workspace/site",
          focused: true,
          agent_session: null,
          agent: "codex",
          name: "Codex",
          agent_status: "idle",
        },
      ],
    };
  if (command === "herdr_action") {
    document.documentElement.dataset.deliveredContext = String(
      args?.text ?? "",
    );
    return null;
  }
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
    ) : parameters.get("view") === "recovery" ? (
      <section className="preview-workspace">
        <BrowserSurface
          tabId="recovery"
          initialId="fixture-page"
          active
          address="https://example.invalid"
          profile="default"
          picking={false}
          viewport={null}
          onReady={() => {}}
          onFrame={() => {}}
          onCapture={() => {}}
          onError={() => {}}
        />
      </section>
    ) : ["downloads", "remote-downloads"].includes(
        parameters.get("view") ?? "",
      ) ? (
      <section className="preview-workspace">
        <DownloadsPanel model={{ report: () => {}, setPanelOpen: () => {} }} />
      </section>
    ) : (
      <PreviewWorkspace
        shown
        deliveryAdapter={herdrDeliveryAdapter}
        workspacePath="/workspace/site"
      />
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
