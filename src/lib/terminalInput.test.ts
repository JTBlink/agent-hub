import { expect, it, vi } from "vitest";
import { createTerminalInputQueue } from "./terminalInput";

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("delivers a fast command after a slow IPC without one round-trip per queued key", async () => {
  const first = deferred();
  const completed = deferred();
  const write = vi.fn<(data: string) => Promise<void>>(async () => {});
  write.mockImplementationOnce(() => first.promise);
  write.mockImplementationOnce(async () => completed.resolve());
  const error = vi.fn();
  const queue = createTerminalInputQueue(error, error);
  queue.connect(write);
  const command = "git branch\r";
  for (const key of command) queue.enqueue(key);
  expect(write).toHaveBeenCalledExactlyOnceWith("g");
  first.resolve();
  await completed.promise;
  expect(write.mock.calls.map(([data]) => data).join("")).toBe(command);
  expect(write).toHaveBeenCalledTimes(2);
  expect(error).not.toHaveBeenCalled();
});

it("buffers startup keystrokes and preserves Unicode, editing keys and Enter in order", async () => {
  const completed = deferred();
  const write = vi.fn(async () => completed.resolve());
  const error = vi.fn();
  const queue = createTerminalInputQueue(error, error);
  const draft = ["echo ", "你好", "🙂", "\u007f", "\u001b[D", "!", "\r"];
  draft.forEach(queue.enqueue);
  expect(write).not.toHaveBeenCalled();
  queue.connect(write);
  await completed.promise;
  expect(write).toHaveBeenCalledExactlyOnceWith(draft.join(""));
  expect(error).not.toHaveBeenCalled();
});

it("chunks large pastes without breaking a Unicode character or overlapping writes", async () => {
  const completed = deferred();
  const draft = `${"a".repeat(8191)}🙂${"中".repeat(20000)}\r`;
  const received: string[] = [];
  let active = false;
  const write = async (data: string) => {
    expect(active).toBe(false);
    active = true;
    await Promise.resolve();
    const encoded = new TextEncoder().encode(data);
    expect(new TextDecoder().decode(encoded)).toBe(data);
    expect(encoded.length).toBeLessThanOrEqual(65536);
    received.push(data);
    active = false;
    if (received.join("").length === draft.length) completed.resolve();
  };
  const error = vi.fn();
  const queue = createTerminalInputQueue(error, error);
  queue.enqueue(draft);
  queue.connect(write);
  await completed.promise;
  expect(received.join("")).toBe(draft);
  expect(error).not.toHaveBeenCalled();
});

it("does not send pending keystrokes after a pane closes during a write", async () => {
  const first = deferred();
  const write = vi.fn(() => first.promise);
  const error = vi.fn();
  const queue = createTerminalInputQueue(error, error);
  queue.connect(write);
  queue.enqueue("g");
  queue.enqueue("it branch\r");
  queue.dispose();
  first.resolve();
  await first.promise;
  queue.enqueue("ignored");
  expect(write).toHaveBeenCalledExactlyOnceWith("g");
});

it("reports write failure and stops before Enter can execute a partial command", async () => {
  const first = deferred();
  const completed = deferred();
  const failure = new Error("PTY unavailable");
  const write = vi.fn(async () => {
    await first.promise;
    throw failure;
  });
  const error = vi.fn(() => completed.resolve());
  const queue = createTerminalInputQueue(error, vi.fn());
  queue.connect(write);
  queue.enqueue("git");
  queue.enqueue(" branch\r");
  first.resolve();
  await completed.promise;
  queue.enqueue("\r");
  expect(error).toHaveBeenCalledExactlyOnceWith(failure);
  expect(write).toHaveBeenCalledExactlyOnceWith("git");
});

it("bounds buffered input and reports overflow without sending a truncated command", () => {
  const full = vi.fn();
  const queue = createTerminalInputQueue(vi.fn(), full);
  queue.enqueue("a".repeat(1024 * 1024));
  queue.enqueue("\r");
  const write = vi.fn(async () => {});
  queue.connect(write);
  expect(full).toHaveBeenCalledOnce();
  expect(write).not.toHaveBeenCalled();
});
