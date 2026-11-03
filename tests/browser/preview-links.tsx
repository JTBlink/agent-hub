// Real link renderers and xterm; IPC is isolated from user settings and external apps.
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { Terminal } from "@xterm/xterm";
import { MarkdownContent } from "../../src/components/MarkdownContent";
import { LinkRoutingSettings } from "../../src/features/preview/components/LinkRoutingSettings";
import { bindTerminalWebLinks } from "../../src/components/terminal/terminalWebLinks";
import { consumePreviewRequests } from "../../src/features/preview/shared/openRequests";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/index.css";
import "../../src/features/preview/preview.css";
import "@xterm/xterm/css/xterm.css";
const parameters = new URLSearchParams(location.search);
document.documentElement.classList.toggle(
  "dark",
  parameters.get("theme") !== "light",
);
applyTextSize(parameters.get("text-size") ?? "default");
let destination = "system";
const record = (kind: string, value: unknown) => {
  const element = document.createElement("pre");
  element.dataset.kind = kind;
  element.textContent = JSON.stringify(value);
  document.querySelector("#results")!.append(element);
};
mockIPC((command, args) => {
  if (command === "get_settings")
    return args?.key === "language"
      ? (parameters.get("language") ?? "en")
      : destination;
  if (command === "set_settings") {
    destination = String(args?.value);
    return;
  }
  if (command === "plugin:opener|open_url") {
    record("system", args);
    return;
  }
  return null;
});
const { i18nReady } = await import("../../src/i18n");
await i18nReady;
createRoot(document.querySelector("#root")!).render(
  <div className="preview-inspector" style={{ width: "min(400px, 100%)" }}>
    <LinkRoutingSettings onError={(error) => record("error", String(error))} />
    <MarkdownContent content="[Example page](https://example.invalid/markdown)" />
    <div id="results" />
  </div>,
);
consumePreviewRequests((request) => record("preview", request));
const terminal = new Terminal({ cols: 48, rows: 6, fontSize: 16 });
terminal.open(document.querySelector("#terminal")!);
bindTerminalWebLinks(terminal, (error) => record("error", String(error)));
terminal.onData((data) => record("input", data));
terminal.write(
  "https://example.invalid/plain\r\n\x1b]8;;https://example.invalid/osc8\x07OSC 8 link\x1b]8;;\x07\r\n\x1b[?1000h\x1b[?1006h",
  () => {
    document.documentElement.dataset.ready = "true";
  },
);
