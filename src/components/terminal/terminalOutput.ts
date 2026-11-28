// Match the native PTY chunk size. xterm checks its yield budget between
// writes, so an entire transport batch must not become one parser call.
const PARSE_CHUNK_BYTES = 16 * 1024;

/** Decode PTY output into bytes without a callback per byte or UTF-8 conversion. */
export function decodeTerminalOutput(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Batch ordered PTY bytes and acknowledge only after xterm has parsed them. */
export function createTerminalOutput(
  write: (bytes: Uint8Array, parsed?: () => void) => void,
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
    const bytes = chunks.length === 1 ? chunks[0] : new Uint8Array(length);
    if (chunks.length > 1) {
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
    }
    const seq = sequence;
    chunks = [];
    length = 0;
    writing = true;
    const parsed = () => {
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
    };
    if (bytes.length <= PARSE_CHUNK_BYTES) {
      write(bytes, parsed);
      return;
    }
    for (let offset = 0; offset < bytes.length; offset += PARSE_CHUNK_BYTES) {
      const end = Math.min(offset + PARSE_CHUNK_BYTES, bytes.length);
      write(
        bytes.subarray(offset, end),
        end === bytes.length ? parsed : undefined,
      );
    }
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
