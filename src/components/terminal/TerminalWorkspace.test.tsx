// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { Project } from "../../lib/tauri";
import { TerminalWorkspace } from "./TerminalWorkspace";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@xterm/xterm", async () => ({
  Terminal: (await import("../../test/terminalEmulator")).TerminalEmulator,
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), Channel: class {} }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("offers a project terminal without requiring Herdr", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/terminal"]}>
        <TerminalWorkspace projects={[]} onMaximizedChange={() => {}} />
      </MemoryRouter>,
    ),
  );
  expect(host.textContent).toContain("terminal.chooseProject");
  expect(
    host.querySelector('button[aria-label="terminal.new"]'),
  ).not.toBeNull();
  await act(async () => root.unmount());
  host.remove();
});

it("toggles terminal maximize and restore without moving keyboard focus", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/terminal"]}>
        <TerminalWorkspace projects={[]} onMaximizedChange={change} />
      </MemoryRouter>,
    ),
  );
  const maximize = host.querySelector<HTMLButtonElement>(
    'button[aria-label="terminal.maximize"]',
  );
  expect(maximize).not.toBeNull();
  maximize?.focus();
  await act(async () => maximize?.click());
  expect(change).toHaveBeenLastCalledWith(true);
  const restore = host.querySelector<HTMLButtonElement>(
    'button[aria-label="terminal.restore"]',
  );
  expect(restore).toBe(document.activeElement);
  await act(async () => restore?.click());
  expect(change).toHaveBeenLastCalledWith(false);
  await act(async () => root.unmount());
  host.remove();
});

it("keeps split panes and input intact while Herdr installs and updates", async () => {
  let finishInstall: (value: unknown) => void = () => {};
  let finishUpdate: (value: unknown) => void = () => {};
  let installing = new Promise((resolve) => {
    finishInstall = resolve;
  });
  const updating = new Promise((resolve) => {
    finishUpdate = resolve;
  });
  let created = 0;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "terminal_project_directory") return "<workspace>";
    if (command === "terminal_create")
      return {
        id: `pty-${++created}`,
        project_id: "demo",
        cwd: "<workspace>",
        exited: false,
      };
    if (command === "terminal_launch_state")
      return { ready: true, revision: 0, herdr_active: false };
    if (command === "herdr_detect") return null;
    if (command === "herdr_install") return installing;
    if (command === "herdr_check_update")
      return { has_update: true, latest_version: "1.2.4", managed: true };
    if (command === "herdr_update") return updating;
    return undefined;
  });
  const project: Project = {
    id: "demo",
    name: "Demo",
    path: "<workspace>",
    workspace_type: "project",
    linked_agent_name: null,
    supports_skill_toggle: true,
    sort_order: 0,
    skill_count: 0,
    sync_health: {
      in_sync: 0,
      project_newer: 0,
      center_newer: 0,
      diverged: 0,
      project_only: 0,
    },
    created_at: 0,
    updated_at: 0,
    visited_at: null,
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/terminal",
            state: {
              projectId: "demo",
              context: {
                key: "task-7",
                title: "Example task",
                url: "https://github.example.invalid/team/demo/issues/7",
                text: "Example task context",
              },
            },
          },
        ]}
      >
        <TerminalWorkspace projects={[project]} onMaximizedChange={() => {}} />
      </MemoryRouter>,
    ),
  );
  const click = async (label: string) => {
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    expect(button).not.toBeNull();
    await act(async () => button?.click());
  };
  expect(
    host.querySelector('button[aria-label="tasks.context"]'),
  ).not.toBeNull();
  expect(
    vi
      .mocked(invoke)
      .mock.calls.some(([command]) => command === "terminal_write"),
  ).toBe(false);
  await click("terminal.new");
  const first = host.querySelector<HTMLTextAreaElement>(
    '[role="tabpanel"]:not([hidden]) textarea[aria-label="Shell input"]',
  );
  expect(first).not.toBeNull();
  await click("terminal.splitHorizontal");
  const panes = host.querySelectorAll<HTMLTextAreaElement>(
    '[role="tabpanel"]:not([hidden]) textarea[aria-label="Shell input"]',
  );
  const second = panes[1];
  expect(second).toBeDefined();
  const herdr = host.querySelector<HTMLButtonElement>(
    'button[title="terminal.herdrLaunch"]',
  );
  await act(async () => herdr?.click());
  await act(async () => {
    second.value = "draft";
    second.focus();
    second.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    finishInstall({ path: "<managed>/herdr", version: "1.2.3", managed: true }),
  );
  expect(host.textContent).toContain("terminal.herdrReady");
  expect(
    vi
      .mocked(invoke)
      .mock.calls.some(([command]) => command === "terminal_launch_herdr"),
  ).toBe(false);
  expect(second.value).toBe("draft");
  expect(document.activeElement).toBe(second);
  installing = new Promise((resolve) => {
    finishInstall = resolve;
  });
  await act(async () => herdr?.click());
  const projectControl = host.querySelector<HTMLButtonElement>(
    'button[aria-label="terminal.chooseProject"]',
  );
  await act(async () => projectControl?.focus());
  await act(async () =>
    finishInstall({ path: "<managed>/herdr", version: "1.2.3", managed: true }),
  );
  expect(
    vi
      .mocked(invoke)
      .mock.calls.some(([command]) => command === "terminal_launch_herdr"),
  ).toBe(false);
  expect(document.activeElement).toBe(projectControl);
  const update = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === "terminal.herdrUpdateAvailable",
  );
  expect(update).toBeDefined();
  await act(async () => update?.click());
  await act(async () =>
    finishUpdate({
      path: "<managed>/new/herdr",
      version: "1.2.4",
      managed: true,
    }),
  );
  expect(second.isConnected).toBe(true);
  expect(second.value).toBe("draft");
  expect(document.activeElement).toBe(projectControl);
  await click("terminal.closePane");
  expect(first?.isConnected).toBe(false);
  expect(second.isConnected).toBe(true);
  await act(async () => root.unmount());
  host.remove();
});
