/** Batch ordered PTY bytes; acknowledge only after xterm has parsed them. */
export function createTerminalOutput(
  write: (bytes: Uint8Array, parsed: () => void) => void,
  acknowledge: (seq: number) => void,
  onParsed: () => void,
) {
  let chunks: Uint8Array[] = [];
  let length = 0;
  let sequence = 0;
  let writing = false;
  let disposed = false;
  let drained: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    if (disposed || writing || !length) return;
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const seq = sequence;
    chunks = [];
    length = 0;
    writing = true;
    write(bytes, () => {
      if (disposed) return;
      writing = false;
      acknowledge(seq);
      onParsed();
      schedule();
      if (!length) {
        const callback = drained;
        drained = undefined;
        callback?.();
      }
    });
  };
  const schedule = () => {
    // Timers also drain hidden panes; rAF can stop and strand PTY credit.
    if (!disposed && !writing && length && timer === undefined)
      timer = setTimeout(flush, 0);
  };
  return {
    enqueue(bytes: Uint8Array, seq: number) {
      if (disposed) return;
      chunks.push(bytes);
      length += bytes.length;
      sequence = seq;
      schedule();
    },
    whenDrained(callback: () => void) {
      if (disposed) return;
      if (!writing && !length) callback();
      else drained = callback;
    },
    dispose() {
      disposed = true;
      drained = undefined;
      clearTimeout(timer);
      chunks = [];
      length = 0;
    },
  };
}
