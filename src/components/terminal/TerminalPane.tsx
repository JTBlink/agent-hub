import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { FitAddon } from "@xterm/addon-fit";
import { createTerminalRenderer } from "./terminalRenderer";
import { bindTerminalPaste } from "./terminalClipboard";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/tauri";
import { getErrorMessage } from "../../lib/error";
import { herdrAgentLabel, type HerdrAgent } from "../../lib/herdrAgents";
import { createTerminalInputQueue } from "../../lib/terminalInput";
import {
  loadTerminalFonts,
  terminalAppearance,
  terminalTheme,
} from "./terminalAppearance";
import "@xterm/xterm/css/xterm.css";

export interface PaneControl {
  sessionId: string;
  cwd: string;
  focus: () => void;
  inputRevision: () => number;
  ownsFocus: (target: EventTarget | null) => boolean;
}
interface Props {
  projectId: string;
  worktreePath?: string;
  agent?: HerdrAgent;
  active: boolean;
  visible?: boolean;
  onReady: (control: PaneControl | null) => void;
}

/** Owns one emulator and one PTY. Visibility changes never recreate either. */
export function TerminalPane({
  projectId,
  worktreePath,
  agent,
  active,
  visible = true,
  onReady,
}: Props) {
  const { t } = useTranslation();
  const element = useRef<HTMLDivElement>(null);
  const fitNow = useRef<() => void>(() => {});
  const focusNow = useRef<() => void>(() => {});
  const callback = useRef(onReady);
  const activeRef = useRef(active);
  const visibleRef = useRef(visible);
  const showNow = useRef<() => void>(() => {});
  const translate = useRef(t);
  useLayoutEffect(() => {
    translate.current = t;
  }, [t]);
  useLayoutEffect(() => {
    activeRef.current = active;
    visibleRef.current = visible;
    callback.current = onReady;
  }, [active, visible, onReady]);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    if (!element.current) return;
    const node = element.current;
    const terminal = new Terminal({
      ...terminalAppearance(getComputedStyle(document.documentElement)),
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(node);
    const unbindPaste = bindTerminalPaste(node, terminal);
    const renderer = createTerminalRenderer(terminal);
    let fontsReady = false;
    let disposed = false;
    let sessionId: string | null = null;
    let pendingAck = 0;
    let frame = 0;
    let revision = 0;
    const fail = (reason: unknown) => {
      if (!disposed)
        setError(getErrorMessage(reason, translate.current("terminal.error")));
    };
    const inputQueue = createTerminalInputQueue(fail, () =>
      fail(new Error(translate.current("terminal.inputFull"))),
    );
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (
          disposed ||
          !visibleRef.current ||
          !node.getBoundingClientRect().width ||
          !node.getBoundingClientRect().height
        )
          return;
        fit.fit();
        terminal.refresh(0, terminal.rows - 1);
        if (sessionId)
          void api
            .resizeTerminal(sessionId, {
              rows: terminal.rows,
              cols: terminal.cols,
            })
            .catch(fail);
      });
    };
    fitNow.current = measure;
    showNow.current = () => {
      renderer.setVisible(fontsReady && visibleRef.current);
      if (visibleRef.current) measure();
    };
    focusNow.current = () => terminal.focus();
    const recolor = () => {
      const styles = getComputedStyle(document.documentElement);
      terminal.options = terminalAppearance(styles);
      terminal.options.theme = terminalTheme(styles);
      measure();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const theme = new MutationObserver(recolor);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    const redrawFonts = () => {
      if (disposed) return;
      renderer.redraw();
      measure();
    };
    document.fonts?.addEventListener("loadingdone", redrawFonts);
    recolor();
    const input = terminal.onData((data) => {
      if (disposed) return;
      revision += 1;
      inputQueue.enqueue(data);
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (
        event.type === "keydown" &&
        (event.metaKey || (event.ctrlKey && event.shiftKey)) &&
        event.key.toLowerCase() === "c" &&
        terminal.hasSelection()
      ) {
        void writeText(terminal.getSelection()).catch(fail);
        event.preventDefault();
        return false;
      }
      return true;
    });
    void loadTerminalFonts()
      .catch(fail)
      .then(() => {
        if (disposed) return;
        fontsReady = true;
        showNow.current();
        if (
          node.getBoundingClientRect().width &&
          node.getBoundingClientRect().height
        )
          fit.fit();
        return api
          .createTerminal(
            projectId,
            { rows: terminal.rows, cols: terminal.cols },
            (event) => {
              if (disposed) return;
              if (event.kind === "output") {
                const bytes = Uint8Array.from(atob(event.data), (character) =>
                  character.charCodeAt(0),
                );
                terminal.write(bytes, () => {
                  if (disposed) return;
                  if (sessionId)
                    void api.ackTerminal(sessionId, event.seq).catch(fail);
                  else pendingAck = event.seq;
                });
              } else if (event.kind === "exit") setExitCode(event.code);
              else setError(event.message);
            },
            worktreePath,
            agent,
          )
          .then((session) => {
            if (disposed) {
              void api.closeTerminal(session.id).catch(() => {});
              return;
            }
            sessionId = session.id;
            setStarted(true);
            inputQueue.connect((data) => api.writeTerminal(session.id, data));
            callback.current({
              sessionId,
              cwd: session.cwd,
              focus: () => terminal.focus(),
              inputRevision: () => revision,
              ownsFocus: (target) =>
                target instanceof Node && node.contains(target),
            });
            if (pendingAck)
              void api.ackTerminal(sessionId, pendingAck).catch(fail);
            measure();
            if (activeRef.current) terminal.focus();
          })
          .catch(fail);
      })
      .catch(fail);
    return () => {
      disposed = true;
      callback.current(null);
      cancelAnimationFrame(frame);
      observer.disconnect();
      theme.disconnect();
      document.fonts?.removeEventListener("loadingdone", redrawFonts);
      input.dispose();
      unbindPaste();
      inputQueue.dispose();
      showNow.current = () => {};
      renderer.dispose();
      terminal.dispose();
      if (sessionId) void api.closeTerminal(sessionId).catch(() => {});
    };
  }, [projectId, worktreePath, agent]);
  useEffect(() => {
    showNow.current();
  }, [visible]);
  useEffect(() => {
    if (active) {
      fitNow.current();
      focusNow.current();
    }
  }, [active]);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {agent && !started && !error && (
        <div role="status" className="px-2 py-1 text-xs text-muted">
          {t("terminal.startingAgent", { agent: herdrAgentLabel(agent) })}
        </div>
      )}
      {error && (
        <div role="alert" className="px-2 text-xs text-danger">
          {error}
        </div>
      )}
      <div
        ref={element}
        className="terminal-emulator min-h-0 flex-1 overflow-hidden"
        // Keep mouse handling in xterm (including TUI mouse reporting).
        onContextMenu={(event) => event.preventDefault()}
      />
      {exitCode !== null && (
        <div role="status" className="px-2 text-xs text-muted">
          {t("terminal.exited", { code: exitCode })}
        </div>
      )}
    </div>
  );
}
