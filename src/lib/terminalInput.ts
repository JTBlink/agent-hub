const INPUT_LIMIT = 1024 * 1024;
const INPUT_CHUNK = 8192;
type Writer = (data: string) => Promise<void>;

/** Buffer startup input and batch keystrokes accumulated during an IPC write. */
export function createTerminalInputQueue(
  onError: (reason: unknown) => void,
  onFull: () => void,
) {
  let writer: Writer | undefined;
  let pending = "";
  let queued = 0;
  let writing = false;
  let disposed = false;

  const dispose = () => {
    disposed = true;
    pending = "";
  };
  const flush = async () => {
    if (!writer || writing || disposed) return;
    writing = true;
    try {
      while (pending && !disposed) {
        let end = Math.min(pending.length, INPUT_CHUNK);
        // IPC strings must not split a supplementary Unicode character.
        const last = pending.charCodeAt(end - 1);
        if (end < pending.length && last >= 0xd800 && last <= 0xdbff) end--;
        const chunk = pending.slice(0, end);
        pending = pending.slice(end);
        await writer(chunk);
        queued -= chunk.length;
      }
    } catch (reason) {
      // A rejected write must not let a later Enter execute an incomplete draft.
      dispose();
      onError(reason);
    } finally {
      writing = false;
    }
  };
  return {
    enqueue(data: string) {
      if (disposed || !data) return;
      if (queued + data.length > INPUT_LIMIT) {
        dispose();
        onFull();
        return;
      }
      pending += data;
      queued += data.length;
      void flush();
    },
    connect(write: Writer) {
      writer = write;
      void flush();
    },
    dispose,
  };
}
