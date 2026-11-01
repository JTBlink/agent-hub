import { createRoot } from "react-dom/client";
import { Terminal } from "@xterm/xterm";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/i18n";
import "../../src/index.css";

// Exercise real xterm mouse reporting without starting a shell or reading accounts.
const terminals: Terminal[] = [];
let ready = false;
const open = Terminal.prototype.open;
Terminal.prototype.open = function (parent) {
  terminals.push(this);
  open.call(this, parent);
};
Object.assign(window, {
  __TAURI_INTERNALS__: {
    transformCallback: () => 1,
    invoke: async (command: string) => {
      if (command === "terminal_create")
        return { id: "mouse-preview", cwd: "<workspace>" };
    },
  },
});
const { TerminalPane } =
  await import("../../src/components/terminal/TerminalPane");
const pause = () => new Promise((resolve) => setTimeout(resolve, 100));
const write = (text: string) =>
  new Promise<void>((resolve) => terminals[0].write(text, resolve));
async function run() {
  const output = document.querySelector("output")!;
  const results = [];
  while (!ready) await pause();
  for (const theme of ["dark", "light"]) {
    document.documentElement.classList.toggle("dark", theme === "dark");
    for (const size of ["small", "default", "large", "xlarge"]) {
      applyTextSize(size);
      await pause();
      await write(
        "\x1b[?1000h\x1b[?1006h\x1b[2J\x1b[HMouse target\r\n│ separator\r\n│ content",
      );
      const screen =
        terminals[0].element!.querySelector<HTMLElement>(".xterm-screen")!;
      const rect = screen.getBoundingClientRect();
      for (const [col, row] of [
        [10, 3],
        [30, 10],
        [2, terminals[0].rows - 2],
      ]) {
        let actual = "";
        const subscription = terminals[0].onData((data) => {
          actual += data;
        });
        const event = {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: rect.left + ((col - 0.5) * rect.width) / terminals[0].cols,
          clientY: rect.top + ((row - 0.5) * rect.height) / terminals[0].rows,
        };
        screen.dispatchEvent(
          new MouseEvent("mousedown", { ...event, buttons: 1 }),
        );
        document.dispatchEvent(new MouseEvent("mouseup", event));
        subscription.dispose();
        const expected = `\x1b[<0;${col};${row}M`;
        results.push({
          theme,
          size,
          col,
          row,
          actual,
          pass: actual.startsWith(expected),
        });
      }
    }
  }
  applyTextSize("default");
  const result = { pass: results.every((item) => item.pass), results };
  output.textContent = JSON.stringify(result);
  output.dataset.pass = String(result.pass);
}
createRoot(document.getElementById("root")!).render(
  <>
    <button onClick={() => void run()}>Run mouse regression</button>
    <output aria-label="Mouse regression result" />
    <div style={{ display: "flex", width: 900, height: 480 }}>
      <TerminalPane
        projectId="demo"
        active
        onReady={(control) => {
          ready = control !== null;
        }}
      />
    </div>
  </>,
);
