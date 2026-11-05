// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { SidebarActivityBar } from "../../components/SidebarActivityBar";
import { TerminalPanelTools } from "../../components/terminal/TerminalPanelTools";
import { launchTaskAgent } from "../../lib/taskLaunch";
import { getHerdrInventory } from "./disabled";
import {
  readTerminalLayout,
  writeTerminalLayout,
  TERMINAL_LAYOUT_KEY,
} from "../../lib/terminalLayout";

vi.mock("@app/herdr", () => import("./disabled"));
vi.mock("@app/features", () => ({ featureModules: [] }));
vi.mock("@app/product", () => ({
  productConfig: {
    id: "custom",
    features: [],
    hash: "test",
    sidebar: {
      primary: ["skills", "projects"],
      bottom: ["settings"],
      defaultPanel: "projects",
    },
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

it("preserves saved attachment metadata without opening an optional integration", () => {
  const target = {
    session: "default",
    workspace_id: "workspace",
    pane_id: "pane",
    terminal_id: "terminal",
    revision: 0,
    agent_session: null,
  };
  localStorage.setItem(
    TERMINAL_LAYOUT_KEY,
    JSON.stringify({
      version: 1,
      tabs: [
        {
          id: "tab",
          projectId: "demo",
          worktreePath: "/projects/demo",
          panes: ["pane"],
          activePane: "pane",
          direction: "horizontal",
          herdrTarget: target,
        },
      ],
      activeIds: {},
      lastActiveId: "tab",
    }),
  );
  const restored = readTerminalLayout();
  expect(restored.tabs[0].herdrTarget).toEqual(target);
  writeTerminalLayout(restored);
  expect(readTerminalLayout().tabs[0].herdrTarget).toEqual(target);
  expect(invoke).not.toHaveBeenCalled();
  localStorage.removeItem(TERMINAL_LAYOUT_KEY);
});

it("uses product navigation order without mounting a Herdr entry or checking installation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <SidebarActivityBar
          panelOpen
          panelId="panel"
          selectedPanel="projects"
          manualSelection
          onSelectPanel={vi.fn()}
          gitSidebarOpen={false}
          onSelectGit={vi.fn()}
        />
      </MemoryRouter>,
    ),
  );
  expect(
    [...host.querySelectorAll("button")].map(
      (button) => button.dataset.sidebarPanel,
    ),
  ).toEqual(["skills", "projects"]);
  expect(host.querySelector('[aria-label="Herdr"]')).toBeNull();
  expect(await getHerdrInventory()).toEqual({ installed: false, sessions: [] });
  expect(invoke).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});

it("keeps normal terminal controls while omitting Herdr launch and upgrade actions", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <TerminalPanelTools
        hasTerminal
        herdrBusy={false}
        updateVersion="1.0.0"
        onHerdr={vi.fn()}
        onHerdrUpgrade={vi.fn()}
        canSplit
        onSplit={vi.fn()}
      />,
    ),
  );
  expect(host.querySelector('[aria-label="Herdr"]')).toBeNull();
  expect(
    host.querySelector('[aria-label="terminal.herdrUpdateAvailable"]'),
  ).toBeNull();
  expect(host.querySelector('[aria-label="common.more"]')).not.toBeNull();
  await act(async () => root.unmount());
});

const input = {
  projectId: "demo",
  path: "/projects/demo",
  session: "old-session",
  kind: "codex",
  name: "task",
  prompt: "Fix issue",
};
it("starts tasks through the native backend with one request", async () => {
  const receipt = {
    id: "launch",
    backend: "terminal",
    phase: "submitted",
    exit_code: null,
  };
  vi.mocked(invoke).mockResolvedValueOnce({ receipt, warning: null });
  expect(await launchTaskAgent(input)).toEqual({
    native: receipt,
    attachment: null,
    warning: null,
  });
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith(
    "task_native_agent_launch",
    expect.objectContaining({ projectId: "demo" }),
  );
});

it("does not retry through a removed integration if native launch gives no receipt", async () => {
  vi.mocked(invoke).mockResolvedValueOnce(null);
  await expect(launchTaskAgent(input)).rejects.toThrow("receipt");
  expect(invoke).toHaveBeenCalledTimes(1);
});
