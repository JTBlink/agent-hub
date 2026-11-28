import { Buffer } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import { createTerminalOutput, decodeTerminalOutput } from "./terminalOutput";

afterEach(() => vi.useRealTimers());

it("decodes binary PTY chunks without repairing partial UTF-8 or ANSI sequences", () => {
  const chunks = [[0, 255, 27, 91], [51, 50, 109, 0xe4, 0xb8], [0xad]];
  for (const chunk of chunks) {
    const encoded = Buffer.from(chunk).toString("base64");
    expect(Array.from(decodeTerminalOutput(encoded))).toEqual(chunk);
  }
});

it("preserves byte order and acknowledges each batch only after parsing", () => {
  vi.useFakeTimers();
  const callbacks: Array<() => void> = [];
  const writes: number[][] = [];
  const ack = vi.fn();
  const parsed = vi.fn();
  const output = createTerminalOutput(
    (bytes, done) => {
      writes.push(Array.from(bytes));
      if (done) callbacks.push(done);
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
  const write = vi.fn((_bytes: Uint8Array, done?: () => void) => {
    if (done) finish = done;
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
      if (done) finish = done;
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

it("bounds parser writes under a burst without crediting an unfinished batch", () => {
  vi.useFakeTimers();
  const total = 256 * 1024;
  const bytes = new Uint8Array(total);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
  const slices: Uint8Array[] = [];
  let finish: (() => void) | undefined;
  const ack = vi.fn();
  const parsed = vi.fn();
  const drained = vi.fn();
  const output = createTerminalOutput(
    (slice, done) => {
      expect(finish).toBeUndefined();
      slices.push(slice);
      finish = done;
    },
    ack,
    parsed,
  );
  output.enqueue(bytes.subarray(0, 3000), 1);
  output.enqueue(bytes.subarray(3000), 2);
  output.whenDrained(drained);
  vi.runAllTimers();
  expect(slices.map((slice) => slice.length)).toEqual(
    Array(16).fill(16 * 1024),
  );
  expect(Buffer.compare(Buffer.concat(slices), bytes)).toBe(0);
  expect(ack).not.toHaveBeenCalled();
  expect(drained).not.toHaveBeenCalled();
  expect(finish).toBeTypeOf("function");
  finish?.();
  expect(ack).toHaveBeenCalledExactlyOnceWith(2);
  expect(parsed).toHaveBeenCalledOnce();
  expect(drained).toHaveBeenCalledOnce();
  output.dispose();
});
