// @vitest-environment jsdom
import { act, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import * as api from "../../lib/tauri";
import type { PaneControl } from "./TerminalPane";
import { useHerdrShortcut } from "./useHerdrShortcut";
import { TerminalPanelTools } from "./TerminalPanelTools";

vi.mock("../../lib/tauri", () => ({
  terminalLaunchState: vi.fn(),
  detectHerdr: vi.fn(),
  installHerdr: vi.fn(),
  launchTerminalHerdr: vi.fn(),
  checkHerdrUpdate: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => vi.resetAllMocks());

it("keeps the launch target focused when the busy button loses focus", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let finishDetection!: (value: api.HerdrInstallation) => void;
  vi.mocked(api.terminalLaunchState).mockResolvedValue({
    ready: true,
    revision: 7,
    herdr_active: false,
  });
  vi.mocked(api.detectHerdr).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishDetection = resolve;
      }),
  );
  vi.mocked(api.checkHerdrUpdate).mockResolvedValue({
    has_update: false,
    latest_version: "1.0.0",
    managed: false,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const mount = document.createElement("div");
  host.append(mount);
  const root = createRoot(mount);
  const pane = document.createElement("textarea");
  host.append(pane);
  const control: PaneControl = {
    sessionId: "pty-demo",
    cwd: "<workspace>",
    focus: () => pane.focus(),
    inputRevision: () => 0,
    ownsFocus: (target) => target === pane,
  };
  function Harness() {
    const shortcut = useHerdrShortcut(() => control, "demo");
    const button = useRef<HTMLButtonElement>(null);
    useLayoutEffect(() => {
      // A native WebView may return focus to its document when the focused
      // launch button is disabled. Reproduce that without relying on jsdom.
      if (shortcut.busy && document.activeElement === button.current) {
        document.body.tabIndex = -1;
        document.body.focus();
      }
    }, [shortcut.busy]);
    return (
      <button
        ref={button}
        disabled={shortcut.busy}
        onClick={() => void shortcut.launch()}
      >
        Herdr
      </button>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const button = host.querySelector("button")!;
    button.focus();
    await act(async () => button.click());
    await act(async () =>
      finishDetection({
        path: "<tools>/herdr",
        version: "1.0.0",
        managed: false,
      }),
    );
    expect(api.launchTerminalHerdr).toHaveBeenCalledWith("pty-demo", 7);
    expect(document.activeElement).toBe(pane);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    document.body.removeAttribute("tabindex");
  }
});

it("launches when WebView delays terminal focus until after the toolbar click", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(api.terminalLaunchState).mockResolvedValue({
    ready: true,
    revision: 7,
    herdr_active: false,
  });
  let finishDetection!: (value: api.HerdrInstallation) => void;
  vi.mocked(api.detectHerdr).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishDetection = resolve;
      }),
  );
  vi.mocked(api.checkHerdrUpdate).mockResolvedValue({
    has_update: false,
    latest_version: "1.0.0",
    managed: false,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const pane = document.createElement("textarea");
  host.append(pane);
  const mount = document.createElement("div");
  host.append(mount);
  const root = createRoot(mount);
  let focusReady = false;
  const control: PaneControl = {
    sessionId: "pty-demo",
    cwd: "<workspace>",
    // Native WebViews need not transfer focus synchronously inside a click.
    focus: () => {
      if (focusReady) pane.focus();
    },
    inputRevision: () => 0,
    ownsFocus: (target) => target === pane,
  };
  function Harness() {
    const shortcut = useHerdrShortcut(() => control, "demo");
    useLayoutEffect(() => {
      const button = mount.querySelector<HTMLButtonElement>(
        'button[title="terminal.herdrLaunch"]',
      );
      if (
        shortcut.busy &&
        button?.disabled &&
        document.activeElement === button
      ) {
        document.body.tabIndex = -1;
        document.body.focus();
      }
      focusReady = shortcut.busy;
    }, [shortcut.busy]);
    return (
      <TerminalPanelTools
        hasTerminal
        herdrBusy={shortcut.busy}
        hasUpdate={false}
        canSplit={false}
        maximized={false}
        onHerdr={() => void shortcut.launch()}
        onHerdrSidebar={() => {}}
        onSplit={() => {}}
        onMaximize={() => {}}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const button = mount.querySelector<HTMLButtonElement>(
      'button[title="terminal.herdrLaunch"]',
    )!;
    await act(async () => {
      button.focus();
      button.click();
    });
    expect(button.getAttribute("aria-busy")).toBe("true");
    await act(async () => button.click());
    expect(api.detectHerdr).toHaveBeenCalledTimes(1);
    await act(async () =>
      finishDetection({
        path: "<tools>/herdr",
        version: "1.0.0",
        managed: false,
      }),
    );
    expect(api.launchTerminalHerdr).toHaveBeenCalledWith("pty-demo", 7);
    expect(api.launchTerminalHerdr).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(pane);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    document.body.removeAttribute("tabindex");
  }
});
