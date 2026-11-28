import { Channel, invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import {
  createTerminalOutput,
  decodeTerminalOutput,
} from "../../src/components/terminal/terminalOutput";
import { createTerminalRenderer } from "../../src/components/terminal/terminalRenderer";
import { terminalAppearance } from "../../src/components/terminal/terminalAppearance";
import { createTerminalInputQueue } from "../../src/lib/terminalInput";
import { loadTerminalFonts } from "../../src/fonts";
import {
  ackTerminal,
  closeTerminal,
  writeTerminal,
  type TerminalEvent,
  type TerminalSession,
} from "../../src/lib/terminalApi";
import "@xterm/xterm/css/xterm.css";
import "../../src/index.css";

declare global {
  var __terminalBenchMode: "combined" | "legacy-decode" | "bounded";
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const root = document.querySelector<HTMLElement>("#panes")!;
root.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:4px";
document.body.style.cssText = "background:#161616;color:white;margin:0";

function percentile(samples: number[], fraction: number) {
  const sorted = [...samples].sort((a, b) => a - b);
  const value = sorted[Math.ceil(sorted.length * fraction) - 1];
  if (value === undefined) throw new Error("Benchmark collected no samples");
  return Math.round(value * 100) / 100;
}

function recentLines(terminal: Terminal) {
  const buffer = terminal.buffer.active;
  const line = buffer.baseY + buffer.cursorY;
  return [line - 2, line - 1, line]
    .map((index) => buffer.getLine(index)?.translateToString(true))
    .join("\n");
}

async function openPane(stream: boolean, visible: boolean) {
  const node = document.createElement("div");
  node.style.cssText = stream
    ? "height:170px;min-width:0"
    : "height:300px;grid-column:1/-1";
  node.hidden = !visible;
  root.append(node);
  const terminal = new Terminal({
    ...terminalAppearance(getComputedStyle(document.documentElement)),
    cols: 80,
    rows: 18,
    cursorBlink: false,
    scrollback: 5000,
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(node);
  if (visible) fit.fit();
  const renderer = createTerminalRenderer(terminal);
  renderer.setVisible(visible);
  const stats = { bytes: 0, messages: 0, decodeMs: 0 };
  let sessionId = "";
  let pendingAck = 0;
  let lastSequence = 0;
  let failure = "";
  const fail = (error: unknown) => {
    failure ||= String(error);
  };
  let onEnd: (error?: Error) => void = () => {};
  const done = stream
    ? new Promise<void>((resolve, reject) => {
        onEnd = (error) => (error ? reject(error) : resolve());
      })
    : Promise.resolve();
  let first: Uint8Array | undefined;
  const output = createTerminalOutput(
    (bytes, parsed) => {
      if (globalThis.__terminalBenchMode === "combined") {
        // The old parser received the contiguous transport batch as one write.
        if (!parsed) {
          first ??= bytes;
          return;
        }
        if (first) {
          bytes = new Uint8Array(
            first.buffer,
            first.byteOffset,
            bytes.byteOffset + bytes.length - first.byteOffset,
          );
          first = undefined;
        }
      }
      terminal.write(bytes, parsed);
    },
    (seq) => {
      if (sessionId) void ackTerminal(sessionId, seq).catch(fail);
      else pendingAck = seq;
    },
    () => {},
  );
  const events = new Channel<TerminalEvent>();
  events.onmessage = (event) => {
    if (event.kind === "output") {
      if (event.seq !== lastSequence + 1)
        fail("Output sequence is not contiguous");
      lastSequence = event.seq;
      const started = performance.now();
      const bytes =
        globalThis.__terminalBenchMode === "bounded"
          ? decodeTerminalOutput(event.data)
          : Uint8Array.from(atob(event.data), (char) => char.charCodeAt(0));
      stats.decodeMs += performance.now() - started;
      stats.messages++;
      stats.bytes += bytes.length;
      output.enqueue(bytes, event.seq);
    } else if (event.kind === "exit") {
      output.whenDrained(() => {
        if (
          event.code !== 0 ||
          !recentLines(terminal).includes("AH_STREAM_END")
        )
          onEnd(
            new Error(
              `Stream exit ${event.code}: missing successful completion marker`,
            ),
          );
        else onEnd();
      });
    } else fail(event.message);
  };
  const session = await invoke<TerminalSession>("benchmark_create", {
    stream,
    size: { rows: terminal.rows, cols: terminal.cols },
    events,
  });
  sessionId = session.id;
  if (pendingAck) await ackTerminal(sessionId, pendingAck);
  const input = createTerminalInputQueue(fail, () => fail("Input queue full"));
  input.connect((data) => writeTerminal(sessionId, data));
  const onData = terminal.onData((data) => input.enqueue(data));
  return {
    terminal,
    stats,
    done,
    webgl: [...node.querySelectorAll("canvas")].some((canvas) =>
      Boolean(canvas.getContext("webgl2")),
    ),
    get failure() {
      return failure;
    },
    async close() {
      onData.dispose();
      input.dispose();
      output.dispose();
      renderer.dispose();
      terminal.dispose();
      node.remove();
      await closeTerminal(sessionId);
    },
  };
}

function echo(terminal: Terminal, token: number) {
  return new Promise<number>((resolve, reject) => {
    const start = performance.now();
    const end = `AH_REPLY:sample-${token}!`;
    const timeout = setTimeout(() => {
      parsed.dispose();
      reject(
        new Error(
          `Missing terminal echo ${token} (${document.visibilityState}, focused=${document.hasFocus()}); recent terminal text: ${recentLines(terminal)}`,
        ),
      );
    }, 3000);
    const parsed = terminal.onWriteParsed(() => {
      if (!recentLines(terminal).includes(end)) return;
      clearTimeout(timeout);
      parsed.dispose();
      resolve(performance.now() - start);
    });
    terminal.input(`sample-${token}!\r`, true);
  });
}

async function scenario(name: "idle" | "hidden-streams" | "visible-streams") {
  const active = await openPane(false, true);
  const hasStreams = name !== "idle";
  const streams = hasStreams
    ? await Promise.all(
        Array.from({ length: 4 }, () =>
          openPane(true, name === "visible-streams"),
        ),
      )
    : [];
  const frames: number[] = [];
  let previous: number | undefined;
  let frame = 0;
  const sampleFrame = (time: number) => {
    if (previous !== undefined) frames.push(time - previous);
    previous = time;
    frame = requestAnimationFrame(sampleFrame);
  };
  try {
    await echo(active.terminal, 0);
    await invoke("benchmark_host_cpu");
    const initialVisibility = document.visibilityState;
    frame = requestAnimationFrame(sampleFrame);
    const started = performance.now();
    streams.forEach((pane) => pane.terminal.input("start\r", true));
    const round = hasStreams ? 40 : 18;
    const echoes: number[] = [];
    for (let number = 1; number <= round; number++) {
      await delay(Math.max(0, started + number * 110 - performance.now()));
      echoes.push(await echo(active.terminal, number));
    }
    const echoEnd = performance.now();
    cancelAnimationFrame(frame);
    const hostCpu = await invoke<number>("benchmark_host_cpu");
    await Promise.all(streams.map((pane) => pane.done));
    const elapsed = (performance.now() - started) / 1000;
    const failures = [active, ...streams]
      .map((pane) => pane.failure)
      .filter(Boolean);
    if (failures.length) throw new Error(failures.join("\n"));
    const bytes = streams.reduce((sum, pane) => sum + pane.stats.bytes, 0);
    return {
      scenario: name,
      echoToParseP95Ms: percentile(echoes, 0.95),
      frameP95Ms:
        frames.length &&
        initialVisibility === "visible" &&
        document.visibilityState === "visible"
          ? percentile(frames, 0.95)
          : null,
      echoSeconds: Math.round((echoEnd - started) / 10) / 100,
      hostCpu,
      samples: echoes.length,
      frames: frames.length,
      documentVisibility: document.visibilityState,
      initialVisibility,
      bytes,
      outputMessages: streams.reduce(
        (sum, pane) => sum + pane.stats.messages,
        0,
      ),
      visibleWebglPanes: [active, ...streams].filter((pane) => pane.webgl)
        .length,
      throughputMiBPerSecond:
        Math.round((bytes / elapsed / 1048576) * 100) / 100,
      decodeMs:
        Math.round(
          streams.reduce((sum, pane) => sum + pane.stats.decodeMs, 0) * 100,
        ) / 100,
    };
  } finally {
    cancelAnimationFrame(frame);
    await Promise.allSettled([active, ...streams].map((pane) => pane.close()));
  }
}

try {
  await loadTerminalFonts();
  const results = [
    await scenario("idle"),
    await scenario("hidden-streams"),
    await scenario("visible-streams"),
  ];
  await invoke("benchmark_finish", {
    result: {
      webview: navigator.userAgent,
      mode: globalThis.__terminalBenchMode,
      results,
    },
    failed: false,
  });
} catch (error) {
  await invoke("benchmark_finish", {
    result: { error: String(error) },
    failed: true,
  });
}
