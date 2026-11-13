import type { DevelopmentTerminal } from "../../lib/developmentPreview";
import { bindTerminalWebLinks } from "./terminalWebLinks";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { FitAddon } from "@xterm/addon-fit";
import { createTerminalOutput } from "./terminalOutput";
import { createTerminalRenderer } from "./terminalRenderer";
import {
  bindTerminalPaste,
  bindTerminalSelectionCopy,
} from "./terminalClipboard";
import { TerminalContextMenu } from "./TerminalContextMenu";
import { pasteTerminalClipboard } from "./terminalNativeClipboard";
import { toast } from "sonner";
import { bindTerminalTextInput } from "./terminalKeyboard";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/tauri";
import type { HerdrTarget } from "@app/herdr";
import { getErrorMessage } from "../../lib/error";
import { herdrAgentLabel, type HerdrAgent } from "@app/herdr";
import { createTerminalInputQueue } from "../../lib/terminalInput";
import { terminalAppearance, terminalTheme } from "./terminalAppearance";
import { loadTerminalFonts } from "../../fonts";
import { remeasureTerminalFont } from "./terminalFonts";
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
  createSession?: (
    size: api.TerminalSize,
    onEvent: (event: api.TerminalEvent) => void,
  ) => Promise<api.TerminalSession>;
  onExit?: (code: number) => void;
  /** Visible text with terminal soft wraps joined into logical lines. */
  onScreen?: (text: string) => void;
  worktreePath?: string;
  agent?: HerdrAgent;
  nativeAgent?: boolean;
  scriptPath?: string;
  development?: DevelopmentTerminal;
  nativeTask?: import("../../lib/terminalLayout").TerminalTab["nativeTask"];
  herdrTarget?: HerdrTarget;
  active: boolean;
  visible?: boolean;
  onReady: (control: PaneControl | null) => void;
}

/** Owns one emulator and one PTY. Visibility changes never recreate either. */
export function TerminalPane({
  projectId,
  createSession,
  onExit,
  onScreen,
  worktreePath,
  agent,
  nativeAgent,
  scriptPath,
  development,
  nativeTask,
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
  const exitCallback = useRef(onExit);
  const screenCallback = useRef(onScreen);
  const activeRef = useRef(active);
  const visibleRef = useRef(visible);
  const showNow = useRef<() => void>(() => {});
  const translate = useRef(t);
  const generation = useRef(0);
  const attachment = useRef(herdrTarget);
  const liveControl = useRef<PaneControl | null>(null);
  const attachmentKey = herdrTarget?.session ?? "";
  useLayoutEffect(() => {
    attachment.current = herdrTarget;
    if (liveControl.current) liveControl.current.herdrTarget = herdrTarget;
  }, [herdrTarget]);
  useLayoutEffect(() => {
    translate.current = t;
  }, [t]);
  useLayoutEffect(() => {
    activeRef.current = active;
    visibleRef.current = visible;
    callback.current = onReady;
    exitCallback.current = onExit;
    screenCallback.current = onScreen;
  }, [active, visible, onReady, onExit, onScreen]);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    if (!element.current) return;
    const lifecycle = generation;
    const currentGeneration = ++lifecycle.current;
    const node = element.current;
    const terminal = new Terminal({
      ...terminalAppearance(getComputedStyle(document.documentElement)),
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
    });
    const readScreen = (unwrap = false) => {
      const buffer = terminal.buffer.active;
      let text = "";
      for (let row = 0; row < terminal.rows; row++) {
        const line = buffer.getLine(buffer.viewportY + row);
        if (row && !(unwrap && line?.isWrapped)) text += "\n";
        text += line?.translateToString(true) ?? "";
      }
      return text;
    };
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(node);
    const unbindWebLinks = bindTerminalWebLinks(terminal, () =>
      toast.error(translate.current("preview.openLinkFailed")),
    );
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
    const unbindPaste = bindTerminalPaste(
      node,
      terminal,
      (isCurrent) => pasteTerminalClipboard(terminal, isCurrent),
      (reason) =>
        toast.error(
          getErrorMessage(
            reason,
            translate.current("terminal.clipboardFailed"),
          ),
        ),
    );
    const renderer = createTerminalRenderer(terminal);
    let fontsReady = false;
    let sessionId: string | null = null;
    let pendingAck = 0;
    let appliedSize: api.TerminalSize | null = null;
    const output = createTerminalOutput(
      (bytes, parsed) => terminal.write(bytes, parsed),
      (seq) => {
        if (sessionId) void api.ackTerminal(sessionId, seq).catch(fail);
        else pendingAck = seq;
      },
      () => screenCallback.current?.(readScreen(true)),
    );
    let frame = 0;
    let revision = 0;
    const fail = (reason: unknown) => {
      if (disposed) return;
      development?.failed(reason);
      nativeTask?.failed(reason);
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
          !fontsReady ||
          !visibleRef.current ||
          !node.getBoundingClientRect().width ||
          !node.getBoundingClientRect().height
        )
          return;
        fit.fit();
        terminal.refresh(0, terminal.rows - 1);
        const size = { rows: terminal.rows, cols: terminal.cols };
        if (
          sessionId &&
          (appliedSize?.rows !== size.rows || appliedSize?.cols !== size.cols)
        ) {
          appliedSize = size;
          void api.resizeTerminal(sessionId, size).catch((reason) => {
            if (appliedSize === size) appliedSize = null;
            fail(reason);
          });
        }
      });
    };
    fitNow.current = measure;
    showNow.current = () => {
      const shown = fontsReady && visibleRef.current;
      terminal.options.cursorBlink = shown;
      if (!shown) terminal.blur();
      renderer.setVisible(shown);
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
      if (disposed || !fontsReady) return;
      remeasureTerminalFont(terminal);
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
      .catch((reason) => {
        // CSS provides fallback fonts; this does not indicate a PTY failure.
        if (!disposed)
          console.warn(
            "Terminal font preload failed; using fallback fonts",
            reason,
          );
      })
      .then(() => {
        if (disposed) return;
        remeasureTerminalFont(terminal);
        fontsReady = true;
        showNow.current();
        if (
          node.getBoundingClientRect().width &&
          node.getBoundingClientRect().height
        )
          fit.fit();
        const size = { rows: terminal.rows, cols: terminal.cols };
        const onEvent = (event: api.TerminalEvent) => {
          if (disposed) return;
          if (event.kind === "output") {
            const bytes = Uint8Array.from(atob(event.data), (character) =>
              character.charCodeAt(0),
            );
            output.enqueue(bytes, event.seq);
          } else if (event.kind === "exit") {
            output.whenDrained(() => {
              setExitCode(event.code);
              exitCallback.current?.(event.code);
              development?.failed(
                new Error(translate.current("fileTree.developmentExited")),
              );
            });
          } else fail(new Error(event.message));
        };
        const session = createSession
          ? createSession(size, onEvent)
          : api.createTerminal(
              projectId,
              size,
              onEvent,
              worktreePath,
              agent,
              attachmentKey ? attachment.current : undefined,
              scriptPath,
              development?.launch,
              nativeTask?.prompt,
              nativeAgent,
            );
        return session
          .then((session) => {
            if (disposed) {
              void api.closeTerminal(session.id).catch(() => {});
              return;
            }
            sessionId = session.id;
            appliedSize = size;
            development?.started();
            nativeTask?.started();
            setStarted(true);
            inputQueue.connect((data) => api.writeTerminal(session.id, data));
            liveControl.current = {
              sessionId,
              cwd: session.cwd,
              focus,
              inputRevision: () => revision,
              ownsFocus: (target) =>
                target instanceof Node && node.contains(target),
              clear: () => terminal.clear(),
              read: readScreen,
              herdrTarget: attachmentKey ? attachment.current : undefined,
            };
            callback.current(liveControl.current);
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
      queueMicrotask(() => {
        if (lifecycle.current === currentGeneration)
          development?.failed(
            new Error(translate.current("fileTree.developmentExited")),
          );
      });
      emulator.current = null;
      copyNow.current = () => {};
      unbindSelectionCopy();
      liveControl.current = null;
      callback.current(null);
      cancelAnimationFrame(frame);
      observer.disconnect();
      theme.disconnect();
      document.fonts?.removeEventListener("loadingdone", redrawFonts);
      input.dispose();
      keyboard.dispose();
      unbindPaste();
      inputQueue.dispose();
      output.dispose();
      showNow.current = () => {};
      renderer.dispose();
      unbindWebLinks();
      terminal.dispose();
      if (sessionId) void api.closeTerminal(sessionId).catch(() => {});
    };
  }, [
    projectId,
    createSession,
    worktreePath,
    agent,
    nativeAgent,
    attachmentKey,
    scriptPath,
    development,
    nativeTask,
  ]);
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
