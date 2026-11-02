import React from "react";
import { HerdrSessionPicker } from "../../src/components/herdr/HerdrSessionPicker";
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
let writeDelay = 0;
let written = "";
let writeCalls = 0;
Object.assign(window, {
  __TAURI_INTERNALS__: {
    transformCallback: () => 1,
    invoke: async (command: string, args: Record<string, unknown>) => {
      if (command === "terminal_create")
        return { id: `preview-${++created}`, cwd: "<workspace>" };
      if (command === "terminal_close") closed++;
      if (command === "terminal_write" && typeof args.data === "string") {
        writeCalls++;
        await new Promise((resolve) => setTimeout(resolve, writeDelay));
        await write(terminals[0], args.data);
        written += args.data;
      }
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

// Compare real pixels to an independent font face: matching a CSS weight alone
// would also pass if a missing Medium file silently fell back to Regular.
async function usesMediumText(terminal: Terminal): Promise<boolean> {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 48;
  const context = canvas.getContext("2d")!;
  const pixels = (font: string) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = font;
    context.fillText("Il1 O0 {} [] != -> git status", 0, 32);
    return canvas.toDataURL();
  };
  const stack = terminal.options.fontFamily;
  for (const italic of [false, true]) {
    const reference = new FontFace(
      "MediumReference",
      `url("/fonts/JetBrainsMono-Medium${italic ? "Italic" : ""}.woff2")`,
      { weight: "500", style: italic ? "italic" : "normal" },
    );
    document.fonts.add(await reference.load());
    try {
      const style = italic ? "italic " : "";
      await document.fonts.load(`${style}400 24px ${stack}`, "M");
      const actual = pixels(
        `${style}${terminal.options.fontWeight} 24px ${stack}`,
      );
      if (
        actual !== pixels(`${style}500 24px MediumReference`) ||
        actual === pixels(`${style}400 24px ${stack}`)
      )
        return false;
    } finally {
      document.fonts.delete(reference);
    }
  }
  return true;
}
Object.assign(window, {
  runTerminalInputRegression: async (
    inputEvents: boolean | "ime" | "ime-composition" = false,
  ) => {
    render(false);
    while (created < 1) await pause();
    const terminal = terminals[0];
    writeDelay = 25;
    let generated = "";
    const generatedInput = terminal.onData((data) => {
      generated += data;
    });
    const command = inputEvents ? "clear" : `${"git branch ".repeat(30)}\r`;
    const started = performance.now();
    for (const key of command) {
      const keyCode =
        typeof inputEvents === "string"
          ? 229
          : inputEvents && key === "a"
            ? 0
            : key === "\r"
              ? 13
              : key.toUpperCase().charCodeAt(0);
      const event = new KeyboardEvent("keydown", {
        key: key === "\r" ? "Enter" : key,
        keyCode,
        bubbles: true,
        cancelable: true,
      });
      terminal.textarea!.dispatchEvent(event);
      if (!event.defaultPrevented && inputEvents === "ime-composition") {
        terminal.textarea!.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true }),
        );
        terminal.textarea!.dispatchEvent(
          new CompositionEvent("compositionupdate", {
            data: key,
            bubbles: true,
          }),
        );
        terminal.textarea!.value = key;
        terminal.textarea!.dispatchEvent(
          new CompositionEvent("compositionend", { data: key, bubbles: true }),
        );
        terminal.textarea!.dispatchEvent(
          new InputEvent("input", {
            inputType: "insertCompositionText",
            data: key,
            bubbles: true,
            composed: true,
          }),
        );
      } else if (!event.defaultPrevented && inputEvents === "ime") {
        terminal.textarea!.value += key;
        terminal.textarea!.dispatchEvent(
          new InputEvent("input", {
            inputType: "insertText",
            data: key,
            bubbles: true,
            composed: true,
          }),
        );
      } else if (!event.defaultPrevented && inputEvents && key === "a") {
        terminal.textarea!.dispatchEvent(
          new InputEvent("input", {
            inputType: "insertText",
            data: key,
            bubbles: true,
            composed: true,
          }),
        );
      } else if (!event.defaultPrevented) {
        terminal.textarea!.dispatchEvent(
          new KeyboardEvent("keypress", {
            key,
            keyCode,
            charCode: key.charCodeAt(0),
            bubbles: true,
            cancelable: true,
          }),
        );
      }
      terminal.textarea!.dispatchEvent(
        new KeyboardEvent("keyup", { key, keyCode }),
      );
    }
    if (typeof inputEvents === "string") await pause();
    generatedInput.dispose();
    if (inputEvents)
      return {
        complete: generated === command,
        received: generated,
        characters: command.length,
        writeCalls,
        elapsed: Math.round(performance.now() - started),
        created,
        closed,
      };
    while (written.length < command.length) {
      if (performance.now() - started > 15000) break;
      await pause();
    }
    const displayed = terminal.buffer.active
      .getLine(0)!
      .translateToString(true);
    return {
      complete: written === command,
      displayed: displayed.startsWith("git branch git branch"),
      characters: command.length,
      writeCalls,
      elapsed: Math.round(performance.now() - started),
      created,
      closed,
    };
  },
  runTerminalRenderingRegression: async () => {
    document.documentElement.dataset.stage = "initial";
    render(false);
    while (created < 1) await pause();
    // Every icon must be supplied by the explicit bundled symbol family, including
    // supplementary-plane symbols and all ANSI styles, without OS fallback.
    const icons = [
      "\ue60b",
      "\uf07b",
      "\uf002", // Sidebar search
      "\uf126", // Sidebar source control
      "\uf06e", // Sidebar review
      "\uf013", // Sidebar settings
      "\uf07c",
      "\uf48a",
      "\uea7f",
      "\uea80",
      "\ueb37",
      "\ueac5",
      "\udb80\udc01",
    ];
    const iconsReady = (
      await Promise.all(
        ["", "bold ", "italic ", "bold italic "].flatMap((style) =>
          icons.map(async (icon) => {
            const faces = await document.fonts.load(
              `${style}14px "AgentHub Symbols"`,
              icon,
            );
            return faces.some(
              (face) =>
                face.family === "AgentHub Symbols" &&
                face.status === "loaded" &&
                face.unicodeRange.toUpperCase().includes("E000"),
            );
          }),
        ),
      )
    ).every(Boolean);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const pixels = (font: string, glyph: string) => {
      context.clearRect(0, 0, 64, 64);
      context.font = font;
      context.fillText(glyph, 8, 40);
      return canvas.toDataURL();
    };
    const stack = getComputedStyle(document.documentElement).getPropertyValue(
      "--font-family-code",
    );
    const iconPixelsCorrect = (
      await Promise.all(
        ["", "bold ", "italic ", "bold italic "].map(async (style, index) => {
          const family = `IconReference${index}`;
          const face = new FontFace(
            family,
            'url("/fonts/SymbolsNerdFontMono-Regular.ttf")',
            {
              style: style.includes("italic") ? "italic" : "normal",
              weight: style.includes("bold") ? "700" : "400",
            },
          );
          document.fonts.add(await face.load());
          try {
            return icons.every(
              (icon) =>
                pixels(`${style}24px ${stack}`, icon) ===
                pixels(`${style}24px ${family}`, icon),
            );
          } finally {
            document.fonts.delete(face);
          }
        }),
      )
    ).every(Boolean);
    const first = terminals[0];
    const mediumTextReady = await usesMediumText(first);
    await write(
      first,
      "\x1b[?25l\x1b[31mABCDEFGHIJKLMNOPQRSTUVWXYZ\x1b[0m\r\n╭── pane ──╮\r\n│ stable   │\r\n╰──────────╯\r\n JSON    folder    markdown\r\n new file    new folder    refresh    collapse\r\n files    search    Git    review    settings\r\n\x1b[1m \x1b[0m  \x1b[3m \x1b[0m  \x1b[1;3m \x1b[0m",
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
    let gridFits = true;
    let noOuterInsets = true;
    for (const scale of [1, 1.2]) {
      document.documentElement.style.zoom = String(scale);
      document.documentElement.style.setProperty("--app-scale", String(scale));
      await pause();
      for (const terminal of terminals) {
        const screen = terminal
          .element!.querySelector(".xterm-screen")!
          .getBoundingClientRect();
        const container =
          terminal.element!.parentElement!.getBoundingClientRect();
        noOuterInsets &&=
          Math.abs(screen.left - container.left) < 1 &&
          Math.abs(screen.top - container.top) < 1;
        gridFits &&=
          screen.bottom <= container.bottom + 1 &&
          container.bottom - screen.bottom <
            screen.height / terminal.rows + 1 &&
          screen.right <= container.right - 11;
      }
    }
    let gutterMatchesBackground = true;
    for (const dark of [false, true]) {
      document.documentElement.classList.toggle("dark", dark);
      await pause();
      for (const terminal of terminals) {
        // TUIs may change their default background through OSC 11.
        terminal.options.theme = {
          ...terminal.options.theme,
          background: "#000000",
        };
        const container = terminal.element!.parentElement!;
        const gutter = terminal.element!.querySelector(
          ".xterm-scrollable-element",
        )!;
        gutterMatchesBackground &&=
          getComputedStyle(gutter).backgroundColor ===
          getComputedStyle(container).backgroundColor;
      }
    }
    const pickerHost = document.createElement("div");
    pickerHost.className = "flex w-64 items-center";
    document.body.append(pickerHost);
    const picker = createRoot(pickerHost);
    picker.render(
      <HerdrSessionPicker
        session="default"
        inventory={{
          installed: true,
          sessions: [{ name: "default", default: true, running: true }],
        }}
        disabled={false}
        onChange={() => {}}
        onRefresh={() => {}}
      />,
    );
    await pause();
    pickerHost.querySelector<HTMLButtonElement>('[role="combobox"]')!.click();
    await pause();
    const menu = document.querySelector<HTMLElement>('[role="listbox"]')!;
    const sessionMenuFits = menu.scrollHeight === menu.clientHeight;
    picker.unmount();
    pickerHost.remove();
    const result = {
      mediumTextReady,
      sessionMenuFits,
      noOuterInsets,
      gutterMatchesBackground,
      gridFits,
      cacheStable,
      iconsReady,
      iconPixelsCorrect,
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
