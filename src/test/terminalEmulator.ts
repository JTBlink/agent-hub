/** A DOM-only external xterm adapter for workspace interaction tests. */
export class TerminalEmulator {
  cols = 80;
  rows = 24;
  options: Record<string, unknown> = {};
  private input: HTMLTextAreaElement | null = null;
  private data: ((value: string) => void) | null = null;
  loadAddon() {}
  open(element: HTMLElement) {
    this.input = document.createElement("textarea");
    this.input.setAttribute("aria-label", "Shell input");
    this.input.addEventListener("input", () =>
      this.data?.(this.input?.value || ""),
    );
    element.append(this.input);
  }
  onData(callback: (value: string) => void) {
    this.data = callback;
    return {
      dispose: () => {
        this.data = null;
      },
    };
  }
  attachCustomKeyEventHandler() {}
  focus() {
    this.input?.focus();
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
    this.input?.remove();
  }
}
