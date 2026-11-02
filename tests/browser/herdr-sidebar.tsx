import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { makeProject, makeTool } from "../fixtures/workspace";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/index.css";

// Real components with synthetic IPC; this fixture cannot contact a daemon or account.
const params = new URLSearchParams(location.search);
const storage = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  },
});
Object.defineProperty(document, "hasFocus", {
  configurable: true,
  value: () => true,
});
Object.defineProperty(document, "visibilityState", {
  configurable: true,
  value: "visible",
});
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
const project = { ...makeProject(), path: "/projects/demo" };
const workspaces = Array.from({ length: 14 }, (_, i) => ({
  workspace_id: `w${i + 1}`,
  active_tab_id: `w${i + 1}:t1`,
  label: i === 0 ? "demo-app" : "Demo workspace " + (i + 1),
  directory: project.path,
  branch: i % 2 ? "feature/terminal" : "main",
}));
const panes = workspaces.map((w, i) => ({
  pane_id: `${w.workspace_id}:p1`,
  workspace_id: w.workspace_id,
  tab_id: w.active_tab_id,
  terminal_id: `native-${i}`,
  cwd: project.path,
  focused: true,
  revision: 1,
  agent_status: ["idle", "working", "blocked", "done"][i % 4],
  agent: "codex",
  name: `codex-${i + 1}`,
  agent_session: { id: `agent-${i}` },
}));
let callbackId = 0;
Object.assign(window, {
  __TAURI_INTERNALS__: {
    transformCallback: () => ++callbackId,
    invoke: async (command: string, args: Record<string, unknown> = {}) => {
      if (command === "get_settings")
        return args.key === "language"
          ? (params.get("language") ?? "zh")
          : args.key === "text_size"
            ? (params.get("text-size") ?? "default")
            : null;
      if (command === "get_projects") return [project];
      if (command === "get_tool_status")
        return [makeTool("codex"), makeTool("claude_code")];
      if (command === "get_active_skill_group") return null;
      if (
        command === "get_skill_groups" ||
        command === "get_managed_skills" ||
        command === "terminal_list"
      )
        return [];
      if (command === "herdr_inventory")
        return {
          installed: true,
          sessions: [{ name: "default", running: true, default: true }],
        };
      if (command === "herdr_snapshot")
        return {
          version: "0.9.3",
          workspaces,
          tabs: workspaces.map((w) => ({
            tab_id: w.active_tab_id,
            workspace_id: w.workspace_id,
            label: "development",
          })),
          panes,
          agents: panes,
          layouts: panes.map((p) => ({ tab_id: p.tab_id, zoomed: false })),
        };
      if (command === "herdr_open" || command === "herdr_ensure") {
        const pane =
          panes.find((p) => p.pane_id === args.paneId) ||
          panes.find((p) => p.workspace_id === args.workspaceId) ||
          panes[0];
        return {
          project_id: project.id,
          path: project.path,
          target: { session: "default", ...pane },
        };
      }
      if (command === "herdr_action")
        return {
          output: "Synthetic output for review\nAll checks passed.",
          target: null,
        };
      if (command === "herdr_start_agent")
        return { target: { session: "default", ...panes[0] }, warning: null };
      if (command === "herdr_terminal_create" || command === "terminal_create")
        return {
          id: `preview-${++callbackId}`,
          project_id: project.id,
          cwd: project.path,
          exited: false,
        };
      if (command === "check_app_update") return { has_update: false };
      if (command === "herdr_sidebar_keys") return "\u0002b";
      return null;
    },
  },
});
const [{ AppProvider }, { SidebarHerdr }, { TerminalWorkspace }, i18n] =
  await Promise.all([
    import("../../src/context/AppContext"),
    import("../../src/features/herdr/components/SidebarHerdr"),
    import("../../src/components/terminal/TerminalWorkspace"),
    import("../../src/i18n"),
  ]);
await i18n.i18nReady;
applyTextSize(params.get("text-size") ?? "default");
createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <MemoryRouter>
      <div className="fixed inset-0 flex min-h-0 bg-background text-primary">
        <aside className="w-72 shrink-0 border-r border-border">
          <SidebarHerdr active onHide={() => {}} />
        </aside>
        <main className="flex min-w-0 flex-1">
          <TerminalWorkspace projects={[project]} />
        </main>
      </div>
    </MemoryRouter>
  </AppProvider>,
);
