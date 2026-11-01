import React from "react";
import { createRoot } from "react-dom/client";
import { Terminal } from "@xterm/xterm";
import "../../src/i18n";
import "../../src/index.css";

// Real emulators/renderers and product panes; IPC never starts a real process.
// Keep the render loop running when automation opens this fixture in a background tab.
window.requestAnimationFrame = (callback) =>
  window.setTimeout(() => callback(performance.now()), 16);
window.cancelAnimationFrame = (id) => window.clearTimeout(id);
let created = 0;
let closed = 0;
Object.assign(window, {
  __TAURI_INTERNALS__: {
    transformCallback: () => 1,
    invoke: async (command: string) => {
      if (command === "terminal_create")
        return { id: `preview-${++created}`, cwd: "<workspace>" };
      if (command === "terminal_close") closed++;
    },
  },
});
const terminals: Terminal[] = [];
const open = Terminal.prototype.open;
Terminal.prototype.open = function (parent) {
  terminals.push(this);
  open.call(this, parent);
  this.options.cursorBlink = false;
};
const { TerminalPane } =
  await import("../../src/components/terminal/TerminalPane");
const root = createRoot(document.getElementById("root")!);
const pause = () => new Promise((resolve) => setTimeout(resolve, 100));
const render = (second: boolean, visible = true) => {
  root.render(
    <div
      style={{ display: visible ? "flex" : "none", height: 480, width: 1000 }}
    >
      {[0, ...(second ? [1] : [])].map((index) => (
        <TerminalPane
          key={index}
          projectId={`demo-${index}`}
          active={visible && index === 0}
          visible={visible}
          onReady={() => {}}
        />
      ))}
    </div>,
  );
};
async function snapshot(terminal: Terminal): Promise<string> {
  return new Promise((resolve) => {
    const subscription = terminal.onRender(() => {
      subscription.dispose();
      const source = Array.from(
        terminal.element!.querySelectorAll("canvas"),
      ).find((canvas) => canvas.getContext("webgl2"))!;
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.getContext("2d")!.drawImage(source, 0, 0);
      resolve(canvas.toDataURL());
    });
    terminal.refresh(0, terminal.rows - 1);
  });
}
const write = (terminal: Terminal, data: string) =>
  new Promise<void>((resolve) => terminal.write(data, resolve));
Object.assign(window, {
  runTerminalRenderingRegression: async () => {
    document.documentElement.dataset.stage = "initial";
    render(false);
    while (created < 1) await pause();
    const first = terminals[0];
    await write(
      first,
      "\x1b[?25l\x1b[31mABCDEFGHIJKLMNOPQRSTUVWXYZ\x1b[0m\r\n╭── pane ──╮\r\n│ stable   │\r\n╰──────────╯",
    );
    // Reserve both pane widths from the start, so only cache changes are tested.
    first.element!.parentElement!.parentElement!.style.width = "500px";
    first.element!.parentElement!.parentElement!.style.flex = "none";
    await pause();
    const before = await snapshot(first);
    document.documentElement.dataset.stage = "second";
    render(true);
    while (created < 2) await pause();
    await write(
      terminals[1],
      "\x1b[?25l\x1b[32mZYXWVUTSRQPONMLKJIHGFEDCBA\x1b[0m\r\n╭── other ─╮",
    );
    await pause();
    const after = await snapshot(first);
    const cacheStable = before === after;
    const result = {
      cacheStable,
      created,
      closed,
      webglPanes: Array.from(document.querySelectorAll(".xterm canvas")).filter(
        (canvas) =>
          canvas instanceof HTMLCanvasElement && canvas.getContext("webgl2"),
      ).length,
    };
    document.documentElement.dataset.stage = "done";
    return result;
  },
});
