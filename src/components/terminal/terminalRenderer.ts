import type { Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";

/** Keep GPU resources local to a visible pane, without touching its PTY/buffer. */
export function createTerminalRenderer(terminal: Terminal) {
  let renderer: WebglAddon | undefined;
  let visible = false;
  const release = () => {
    const previous = renderer;
    renderer = undefined;
    previous?.dispose();
  };
  const redraw = () => {
    if (!visible) return;
    // clearTextureAtlas clears an atlas shared by other terminals, leaving
    // their cached glyph positions stale. Rebuild only this pane's renderer.
    release();
    try {
      const next = new WebglAddon();
      renderer = next;
      next.onContextLoss(() => {
        if (renderer !== next) return;
        release();
        terminal.refresh(0, terminal.rows - 1);
      });
      terminal.loadAddon(next);
    } catch {
      release();
      // Keep the DOM renderer usable when WebGL2 is unavailable.
    }
    terminal.refresh(0, terminal.rows - 1);
  };
  return {
    setVisible(next: boolean) {
      if (visible === next) return;
      visible = next;
      if (visible) redraw();
      else release();
    },
    redraw,
    dispose: release,
  };
}
