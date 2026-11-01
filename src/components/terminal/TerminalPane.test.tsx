// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TerminalPane } from "./TerminalPane";
import * as api from "../../lib/tauri";

const renderer = vi.hoisted(() => ({
  lost: () => {},
  unsupported: false,
  dispose: vi.fn(),
  redraw: vi.fn(),
  created: vi.fn(),
  clearAtlas: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../lib/tauri", () => ({
  createTerminal: vi.fn(async () => ({ id: "pty-1", cwd: "<workspace>" })),
  closeTerminal: vi.fn(async () => {}),
  resizeTerminal: vi.fn(async () => {}),
  writeTerminal: vi.fn(async () => {}),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("@xterm/xterm", async () => {
  const { TerminalEmulator } = await import("../../test/terminalEmulator");
  return {
    Terminal: class extends TerminalEmulator {
      refresh = renderer.redraw;
      clearTextureAtlas = renderer.clearAtlas;
    },
  };
});
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {
    constructor() {
      renderer.created();
      if (renderer.unsupported) throw new Error("WebGL2 unavailable");
    }
    onContextLoss(callback: () => void) {
      renderer.lost = callback;
    }
    dispose = renderer.dispose;
  },
}));

let finishFonts: () => void;
let fontEvents: EventTarget;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.clearAllMocks();
  renderer.unsupported = false;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const loaded = new Promise<void>((resolve) => {
    finishFonts = resolve;
  });
  fontEvents = new EventTarget();
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: Object.assign(fontEvents, { load: vi.fn(() => loaded) }),
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(document, "fonts");
  vi.unstubAllGlobals();
});

it("waits for bundled fonts before starting the PTY and redraws without restarting it", async () => {
  await act(async () =>
    root.render(<TerminalPane projectId="demo" active onReady={() => {}} />),
  );
  expect(api.createTerminal).not.toHaveBeenCalled();
  await act(async () => finishFonts());
  expect(api.createTerminal).toHaveBeenCalledTimes(1);
  const redraws = renderer.redraw.mock.calls.length;
  await act(async () => fontEvents.dispatchEvent(new Event("loadingdone")));
  expect(renderer.redraw.mock.calls.length).toBeGreaterThan(redraws);
  expect(api.createTerminal).toHaveBeenCalledTimes(1);
  expect(api.closeTerminal).not.toHaveBeenCalled();
  const disposals = renderer.dispose.mock.calls.length;
  await act(async () => renderer.lost());
  expect(renderer.dispose).toHaveBeenCalledTimes(disposals + 1);
  expect(host.querySelector("textarea")).not.toBeNull();
  expect(api.closeTerminal).not.toHaveBeenCalled();
});

it("restores visible panes independently of focus without clearing a shared atlas or restarting the PTY", async () => {
  const render = async (visible: boolean) => {
    await act(async () =>
      root.render(
        <TerminalPane
          projectId="demo"
          active={false}
          visible={visible}
          onReady={() => {}}
        />,
      ),
    );
  };
  await render(true);
  await act(async () => finishFonts());
  expect(renderer.created).toHaveBeenCalledOnce();
  for (let index = 0; index < 5; index++) {
    const creations = renderer.created.mock.calls.length;
    const redraws = renderer.redraw.mock.calls.length;
    await render(false);
    await act(async () => fontEvents.dispatchEvent(new Event("loadingdone")));
    expect(renderer.created).toHaveBeenCalledTimes(creations);
    await render(true);
    expect(renderer.created).toHaveBeenCalledTimes(creations + 1);
    expect(renderer.redraw.mock.calls.length).toBeGreaterThan(redraws);
  }
  expect(renderer.clearAtlas).not.toHaveBeenCalled();
  expect(api.createTerminal).toHaveBeenCalledOnce();
  expect(api.closeTerminal).not.toHaveBeenCalled();
});

it("defers GPU allocation when fonts finish after navigating away", async () => {
  await act(async () =>
    root.render(
      <TerminalPane
        projectId="demo"
        active={false}
        visible={false}
        onReady={() => {}}
      />,
    ),
  );
  await act(async () => finishFonts());
  expect(renderer.created).not.toHaveBeenCalled();
  expect(api.createTerminal).toHaveBeenCalledOnce();
  await act(async () =>
    root.render(
      <TerminalPane projectId="demo" active visible onReady={() => {}} />,
    ),
  );
  expect(renderer.created).toHaveBeenCalledOnce();
  expect(api.createTerminal).toHaveBeenCalledOnce();
});

it("does not create a late PTY when the pane closes during font loading", async () => {
  await act(async () =>
    root.render(<TerminalPane projectId="demo" active onReady={() => {}} />),
  );
  await act(async () => root.render(null));
  await act(async () => finishFonts());
  expect(api.createTerminal).not.toHaveBeenCalled();
});

it("keeps the DOM terminal usable when hardware rendering is unavailable", async () => {
  renderer.unsupported = true;
  await act(async () => {
    root.render(<TerminalPane projectId="demo" active onReady={() => {}} />);
    finishFonts();
  });
  expect(api.createTerminal).toHaveBeenCalledOnce();
  expect(host.querySelector("textarea")).not.toBeNull();
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("retains fast keystrokes received before the PTY creation response", async () => {
  let finishSession = () => {};
  vi.mocked(api.createTerminal).mockReturnValueOnce(
    new Promise((resolve) => {
      finishSession = () =>
        resolve({
          id: "starting-pty",
          cwd: "<workspace>",
          project_id: "demo",
          exited: false,
        });
    }),
  );
  await act(async () => {
    root.render(<TerminalPane projectId="demo" active onReady={() => {}} />);
    finishFonts();
  });
  const textarea = host.querySelector("textarea")!;
  await act(async () => {
    for (const key of "git branch") {
      textarea.value = key;
      textarea.dispatchEvent(new Event("input"));
    }
  });
  expect(api.writeTerminal).not.toHaveBeenCalled();
  await act(async () => finishSession());
  expect(api.writeTerminal).toHaveBeenCalledExactlyOnceWith(
    "starting-pty",
    "git branch",
  );
});
