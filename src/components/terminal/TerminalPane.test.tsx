// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TerminalPane } from "./TerminalPane";
import * as api from "../../lib/tauri";
import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";

const renderer = vi.hoisted(() => ({
  lost: () => {},
  unsupported: false,
  dispose: vi.fn(),
  redraw: vi.fn(),
  created: vi.fn(),
  clearAtlas: vi.fn(),
  paste: vi.fn(),
  input: vi.fn(),
  selection: "",
  selectionChanged: () => {},
  modes: { mouseTrackingMode: "none" },
  selectAll: vi.fn(),
  clear: vi.fn(),
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
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue("pasted text"),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@xterm/xterm", async () => {
  const { TerminalEmulator } = await import("../../test/terminalEmulator");
  return {
    Terminal: class extends TerminalEmulator {
      refresh = renderer.redraw;
      clearTextureAtlas = renderer.clearAtlas;
      paste = renderer.paste;
      input = renderer.input;
      modes = renderer.modes;
      selectAll = renderer.selectAll;
      clear = renderer.clear;
      hasSelection() {
        return !!renderer.selection;
      }
      getSelection() {
        return renderer.selection;
      }
      onSelectionChange(callback: () => void) {
        renderer.selectionChanged = callback;
        return {
          dispose() {
            renderer.selectionChanged = () => {};
          },
        };
      }
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
  renderer.selection = "";
  renderer.modes.mouseTrackingMode = "none";
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

it.each([
  {
    types: ["text/plain", "text/html"],
    text: "first\r\n第二行\n",
    image: false,
  },
  {
    types: ["image/png", "text/plain"],
    text: "image description",
    image: true,
  },
  { types: ["image/tiff"], text: "", image: true },
])(
  "routes clipboard $types through terminal paste exactly once",
  async ({ types, text, image }) => {
    await act(async () =>
      root.render(<TerminalPane projectId="demo" active onReady={() => {}} />),
    );
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { types, getData: () => text, items: [] },
    });
    host.querySelector("textarea")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    if (image) {
      expect(renderer.input).toHaveBeenCalledExactlyOnceWith("\x16", true);
      expect(renderer.paste).not.toHaveBeenCalled();
    } else {
      expect(renderer.paste).toHaveBeenCalledExactlyOnceWith(text);
      expect(renderer.input).not.toHaveBeenCalled();
    }
  },
);

it("suppresses the native context menu only inside the terminal and preserves mouse events", async () => {
  await act(async () =>
    root.render(<TerminalPane projectId="demo" active onReady={() => {}} />),
  );
  const input = host.querySelector("textarea")!;
  const mouseDown = vi.fn();
  const contextMenu = vi.fn();
  input.addEventListener("mousedown", mouseDown);
  input.addEventListener("contextmenu", contextMenu);

  const down = new MouseEvent("mousedown", {
    button: 2,
    bubbles: true,
    cancelable: true,
  });
  const menu = new MouseEvent("contextmenu", {
    button: 2,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    input.dispatchEvent(down);
    input.dispatchEvent(menu);
  });
  expect(mouseDown).toHaveBeenCalledOnce();
  expect(contextMenu).toHaveBeenCalledOnce();
  expect(down.defaultPrevented).toBe(false);
  expect(menu.defaultPrevented).toBe(true);
  expect(document.querySelector('[role="menu"]')).not.toBeNull();

  const outside = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
  });
  host.dispatchEvent(outside);
  expect(outside.defaultPrevented).toBe(false);
});

it("copies selected text with a success toast, reports failures and exposes shell clipboard actions", async () => {
  await act(async () =>
    root.render(<TerminalPane projectId="demo" active onReady={() => {}} />),
  );
  await act(async () => {
    renderer.selection = "selected output";
    renderer.selectionChanged();
  });
  expect(writeText).toHaveBeenCalledExactlyOnceWith("selected output");
  expect(toast.success).toHaveBeenCalledWith("terminal.selectionCopied", {
    id: "terminal-selection-copy",
  });
  const input = host.querySelector("textarea")!;
  const openMenu = async () =>
    act(async () =>
      input.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      ),
    );
  const choose = async (label: string) =>
    act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((button) => button.textContent === label)!
        .click(),
    );
  await openMenu();
  await choose("terminal.paste");
  expect(readText).toHaveBeenCalledOnce();
  expect(renderer.paste).toHaveBeenCalledExactlyOnceWith("pasted text");
  expect(document.activeElement).toBe(input);
  await openMenu();
  await choose("terminal.selectAll");
  expect(renderer.selectAll).toHaveBeenCalledOnce();
  await openMenu();
  await choose("herdr.clear");
  expect(renderer.clear).toHaveBeenCalledOnce();
  vi.mocked(writeText).mockRejectedValueOnce(
    new Error("clipboard unavailable"),
  );
  await openMenu();
  await choose("terminal.copySelection");
  expect(toast.error).toHaveBeenCalledWith("clipboard unavailable");
});

it("leaves mouse-aware TUIs in control of right-click and restores the shell menu when mouse reporting ends", async () => {
  await act(async () =>
    root.render(<TerminalPane projectId="demo" active onReady={() => {}} />),
  );
  const input = host.querySelector("textarea")!;
  renderer.modes.mouseTrackingMode = "any";
  const down = vi.fn();
  input.addEventListener("mousedown", down);
  await act(async () => {
    input.dispatchEvent(
      new MouseEvent("mousedown", { button: 2, bubbles: true }),
    );
    input.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
  });
  expect(down).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  renderer.modes.mouseTrackingMode = "none";
  await act(async () =>
    input.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    ),
  );
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
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

it("starts with fallback fonts without reporting a terminal failure when a font resource fails", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(document.fonts.load).mockRejectedValue(
    new Error("A network error occurred."),
  );
  const onReady = vi.fn();
  try {
    await act(async () =>
      root.render(<TerminalPane projectId="demo" active onReady={onReady} />),
    );
    expect(api.createTerminal).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "pty-1" }),
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(warning).toHaveBeenCalled();
  } finally {
    warning.mockRestore();
  }
});

it("still reports PTY creation failures after fonts finish loading", async () => {
  vi.mocked(api.createTerminal).mockRejectedValueOnce(
    new Error("PTY unavailable"),
  );
  await act(async () => {
    root.render(<TerminalPane projectId="demo" active onReady={() => {}} />);
    finishFonts();
  });
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "PTY unavailable",
  );
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
