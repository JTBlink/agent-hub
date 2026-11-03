/** Bound work to one request and retain the final position when input stops. */
export function latestDispatcher<T>(
  deliver: (value: T) => Promise<void>,
  delay = 70,
) {
  let pending: T | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    running = false,
    disposed = false;
  const schedule = () => {
    if (disposed || running || timer !== undefined || pending === undefined)
      return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delay);
  };
  const flush = async () => {
    if (disposed || pending === undefined) return;
    const value = pending;
    pending = undefined;
    running = true;
    try {
      await deliver(value);
    } finally {
      running = false;
      schedule();
    }
  };
  return {
    submit(value: T) {
      pending = value;
      schedule();
    },
    clear() {
      pending = undefined;
      clearTimeout(timer);
      timer = undefined;
    },
    dispose() {
      disposed = true;
      pending = undefined;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
