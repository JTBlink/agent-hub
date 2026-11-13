/** A DOM-only external xterm adapter for workspace interaction tests. */
export class TerminalEmulator {
  cols = 80;
  rows = 24;
  options: Record<string, unknown> = {};
  modes = { mouseTrackingMode: "none" };
  private textarea: HTMLTextAreaElement | null = null;
  private data: ((value: string) => void) | null = null;
  private selectionChanged: (() => void) | null = null;
  loadAddon() {}
  clearTextureAtlas() {}
  refresh() {}
  open(element: HTMLElement) {
    this.textarea = document.createElement("textarea");
    this.textarea.setAttribute("aria-label", "Shell input");
    this.textarea.addEventListener("input", () =>
      this.data?.(this.textarea?.value || ""),
    );
    element.append(this.textarea);
  }
  onData(callback: (value: string) => void) {
    this.data = callback;
    return {
      dispose: () => {
        this.data = null;
      },
    };
  }
  onSelectionChange(callback: () => void) {
    this.selectionChanged = callback;
    return {
      dispose: () => {
        this.selectionChanged = null;
      },
    };
  }
  selectAll() {
    this.selectionChanged?.();
  }
  attachCustomKeyEventHandler() {}
  focus() {
    this.textarea?.focus();
  }
  blur() {
    this.textarea?.blur();
  }
  hasSelection() {
    return false;
  }
  getSelection() {
    return "";
  }
  write(_bytes: Uint8Array, complete: () => void) {
    complete();
  }
  dispose() {
    this.textarea?.remove();
  }
}
