import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { FitAddon } from "@xterm/addon-fit";
import { createTerminalRenderer } from "./terminalRenderer";
import {
  bindTerminalPaste,
  bindTerminalSelectionCopy,
} from "./terminalClipboard";
import { TerminalContextMenu } from "./TerminalContextMenu";
import { toast } from "sonner";
import { bindTerminalTextInput } from "./terminalKeyboard";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/tauri";
import type { HerdrTarget } from "../../features/herdr/lib/herdrControlApi";
import { getErrorMessage } from "../../lib/error";
import {
  herdrAgentLabel,
  type HerdrAgent,
} from "../../features/herdr/lib/herdrAgents";
import { createTerminalInputQueue } from "../../lib/terminalInput";
import { terminalAppearance, terminalTheme } from "./terminalAppearance";
import { loadTerminalFonts } from "../../fonts";
import "@xterm/xterm/css/xterm.css";

export interface PaneControl {
  sessionId: string;
  cwd: string;
  focus: () => void;
  inputRevision: () => number;
  ownsFocus: (target: EventTarget | null) => boolean;
  clear?: () => void;
  read?: () => string;
  herdrTarget?: HerdrTarget;
}
interface Props {
  projectId: string;
  worktreePath?: string;
  agent?: HerdrAgent;
  herdrTarget?: HerdrTarget;
  active: boolean;
  visible?: boolean;
  onReady: (control: PaneControl | null) => void;
}

/** Owns one emulator and one PTY. Visibility changes never recreate either. */
export function TerminalPane({
  projectId,
  worktreePath,
  agent,
  herdrTarget,
  active,
  visible = true,
  onReady,
}: Props) {
  const { t } = useTranslation();
  const element = useRef<HTMLDivElement>(null);
  const emulator = useRef<Terminal | null>(null);
  const copyNow = useRef<() => void>(() => {});
  const fitNow = useRef<() => void>(() => {});
  const focusNow = useRef<() => void>(() => {});
  const callback = useRef(onReady);
  const activeRef = useRef(active);
  const visibleRef = useRef(visible);
  const showNow = useRef<() => void>(() => {});
  const translate = useRef(t);
  const attachment = useRef(herdrTarget);
  const attachmentKey = herdrTarget
    ? `${herdrTarget.session}:${herdrTarget.workspace_id}`
    : "";
  useLayoutEffect(() => {
    attachment.current = herdrTarget;
  }, [herdrTarget]);
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
    const keyboard = bindTerminalTextInput(node, terminal);
    emulator.current = terminal;
    let disposed = false;
    const copySelection = () => {
      const text = terminal.getSelection();
      if (!text || disposed) return;
      void writeText(text)
        .then(() => {
          if (!disposed)
            toast.success(translate.current("terminal.selectionCopied"), {
              id: "terminal-selection-copy",
            });
        })
        .catch((reason) => {
          if (!disposed)
            toast.error(
              getErrorMessage(
                reason,
                translate.current("terminal.clipboardFailed"),
              ),
            );
        });
    };
    copyNow.current = copySelection;
    const unbindSelectionCopy = bindTerminalSelectionCopy(
      node,
      terminal,
      copySelection,
    );
    const unbindPaste = bindTerminalPaste(node, terminal);
    const renderer = createTerminalRenderer(terminal);
    let fontsReady = false;
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
    const focus = () => {
      if (!document.querySelector('[aria-modal="true"]')) terminal.focus();
    };
    focusNow.current = focus;
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
        copySelection();
        event.preventDefault();
        return false;
      }
      return keyboard.handle(event);
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
            attachmentKey ? attachment.current : undefined,
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
              focus,
              inputRevision: () => revision,
              ownsFocus: (target) =>
                target instanceof Node && node.contains(target),
              clear: () => terminal.clear(),
              read: () => {
                const buffer = terminal.buffer.active;
                return Array.from(
                  { length: terminal.rows },
                  (_, row) =>
                    buffer
                      .getLine(buffer.viewportY + row)
                      ?.translateToString(true) ?? "",
                ).join("\n");
              },
              herdrTarget: attachmentKey ? attachment.current : undefined,
            });
            if (pendingAck)
              void api.ackTerminal(sessionId, pendingAck).catch(fail);
            measure();
            if (activeRef.current) focus();
          })
          .catch(fail);
      })
      .catch(fail);
    return () => {
      disposed = true;
      emulator.current = null;
      copyNow.current = () => {};
      unbindSelectionCopy();
      callback.current(null);
      cancelAnimationFrame(frame);
      observer.disconnect();
      theme.disconnect();
      document.fonts?.removeEventListener("loadingdone", redrawFonts);
      input.dispose();
      keyboard.dispose();
      unbindPaste();
      inputQueue.dispose();
      showNow.current = () => {};
      renderer.dispose();
      terminal.dispose();
      if (sessionId) void api.closeTerminal(sessionId).catch(() => {});
    };
  }, [projectId, worktreePath, agent, attachmentKey]);
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
      <TerminalContextMenu
        target={element}
        terminal={emulator}
        herdr={!!herdrTarget}
        onCopy={() => copyNow.current()}
      />
      {exitCode !== null && (
        <div role="status" className="px-2 text-xs text-muted">
          {t("terminal.exited", { code: exitCode })}
        </div>
      )}
    </div>
  );
}
