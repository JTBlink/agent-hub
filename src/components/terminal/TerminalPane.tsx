import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { FitAddon } from "@xterm/addon-fit";
import { useTranslation } from "react-i18next";
import * as api from "../../lib/tauri";
import { getErrorMessage } from "../../lib/error";
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
  active: boolean;
  onReady: (control: PaneControl | null) => void;
}

/** Owns one emulator and one PTY. Visibility changes never recreate either. */
export function TerminalPane({ projectId, active, onReady }: Props) {
  const { t } = useTranslation();
  const element = useRef<HTMLDivElement>(null);
  const fitNow = useRef<() => void>(() => {});
  const focusNow = useRef<() => void>(() => {});
  const callback = useRef(onReady);
  const activeRef = useRef(active);
  const translate = useRef(t);
  useLayoutEffect(() => {
    translate.current = t;
  }, [t]);
  useLayoutEffect(() => {
    activeRef.current = active;
    callback.current = onReady;
  }, [active, onReady]);
  const [error, setError] = useState("");
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    if (!element.current) return;
    const node = element.current;
    const terminal = new Terminal({
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
      fontSize: 13,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(node);
    let disposed = false;
    let sessionId: string | null = null;
    let pendingAck = 0;
    let frame = 0;
    let writing = Promise.resolve();
    let revision = 0;
    let queued = 0;
    const fail = (reason: unknown) => {
      if (!disposed)
        setError(getErrorMessage(reason, translate.current("terminal.error")));
    };
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (
          disposed ||
          !node.getBoundingClientRect().width ||
          !node.getBoundingClientRect().height
        )
          return;
        fit.fit();
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
    focusNow.current = () => terminal.focus();
    const recolor = () => {
      const styles = getComputedStyle(document.documentElement);
      terminal.options.theme = {
        background: styles.getPropertyValue("--color-bg").trim() || undefined,
        foreground:
          styles.getPropertyValue("--color-text-primary").trim() || undefined,
        cursor: styles.getPropertyValue("--color-accent").trim() || undefined,
        selectionBackground:
          styles.getPropertyValue("--color-surface-active").trim() || undefined,
      };
      measure();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const theme = new MutationObserver(recolor);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    document.fonts?.addEventListener("loadingdone", measure);
    recolor();
    const input = terminal.onData((data) => {
      if (!sessionId || disposed) return;
      revision += 1;
      const id = sessionId;
      // Preserve input ordering even when an IPC round-trip is slow.
      if (queued + data.length > 1024 * 1024) {
        fail(new Error(translate.current("terminal.inputFull")));
        return;
      }
      queued += data.length;
      writing = writing
        .then(async () => {
          for (const chunk of data.match(/[\s\S]{1,8192}/gu) ?? [])
            await api.writeTerminal(id, chunk);
        })
        .catch(fail)
        .finally(() => {
          queued -= data.length;
        });
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
    fit.fit();
    void api
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
      )
      .then((session) => {
        if (disposed) {
          void api.closeTerminal(session.id).catch(() => {});
          return;
        }
        sessionId = session.id;
        callback.current({
          sessionId,
          cwd: session.cwd,
          focus: () => terminal.focus(),
          inputRevision: () => revision,
          ownsFocus: (target) =>
            target instanceof Node && node.contains(target),
        });
        if (pendingAck) void api.ackTerminal(sessionId, pendingAck).catch(fail);
        measure();
        if (activeRef.current) terminal.focus();
      })
      .catch(fail);
    return () => {
      disposed = true;
      callback.current(null);
      cancelAnimationFrame(frame);
      observer.disconnect();
      theme.disconnect();
      document.fonts?.removeEventListener("loadingdone", measure);
      input.dispose();
      terminal.dispose();
      if (sessionId) void api.closeTerminal(sessionId).catch(() => {});
    };
  }, [projectId]);
  useEffect(() => {
    if (active) {
      fitNow.current();
      focusNow.current();
    }
  }, [active]);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {error && (
        <div role="alert" className="px-2 text-xs text-danger">
          {error}
        </div>
      )}
      <div ref={element} className="min-h-0 flex-1 overflow-hidden p-1" />
      {exitCode !== null && (
        <div role="status" className="px-2 text-xs text-muted">
          {t("terminal.exited", { code: exitCode })}
        </div>
      )}
    </div>
  );
}
