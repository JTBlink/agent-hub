import { afterEach, expect, it, vi } from "vitest";
import { createTerminalOutput } from "./terminalOutput";

afterEach(() => vi.useRealTimers());

it("preserves byte order and acknowledges each batch only after parsing", () => {
  vi.useFakeTimers();
  const callbacks: Array<() => void> = [];
  const writes: number[][] = [];
  const ack = vi.fn();
  const parsed = vi.fn();
  const output = createTerminalOutput(
    (bytes, done) => {
      writes.push(Array.from(bytes));
      callbacks.push(done);
    },
    ack,
    parsed,
  );
  output.enqueue(new Uint8Array([0xe4, 0xb8]), 1);
  output.enqueue(new Uint8Array([0xad]), 2);
  vi.runAllTimers();
  expect(writes).toEqual([[0xe4, 0xb8, 0xad]]);
  expect(ack).not.toHaveBeenCalled();
  output.enqueue(new Uint8Array([10]), 3);
  vi.runAllTimers();
  expect(writes).toHaveLength(1);
  callbacks[0]();
  expect(ack.mock.calls).toEqual([[2]]);
  vi.runAllTimers();
  expect(writes[1]).toEqual([10]);
  callbacks[1]();
  expect(ack.mock.calls).toEqual([[2], [3]]);
  expect(parsed).toHaveBeenCalledTimes(2);
  output.dispose();
});

it("discards queued output and ignores late parser callbacks after disposal", () => {
  vi.useFakeTimers();
  let finish = () => {};
  const write = vi.fn((_bytes: Uint8Array, done: () => void) => {
    finish = done;
  });
  const ack = vi.fn();
  const output = createTerminalOutput(write, ack, vi.fn());
  output.enqueue(new Uint8Array([1]), 1);
  vi.runAllTimers();
  output.enqueue(new Uint8Array([2]), 2);
  output.dispose();
  finish();
  vi.runAllTimers();
  expect(write).toHaveBeenCalledOnce();
  expect(ack).not.toHaveBeenCalled();
});

it("reports exit only after the final queued bytes have been parsed", () => {
  vi.useFakeTimers();
  let finish = () => {};
  const exit = vi.fn();
  const output = createTerminalOutput(
    (_bytes, done) => {
      finish = done;
    },
    vi.fn(),
    vi.fn(),
  );
  output.enqueue(new Uint8Array([10]), 1);
  output.whenDrained(exit);
  expect(exit).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(exit).not.toHaveBeenCalled();
  finish();
  expect(exit).toHaveBeenCalledOnce();
  output.dispose();
});
