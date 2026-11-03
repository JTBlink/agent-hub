import { expect, it, vi } from "vitest";
import { latestDispatcher } from "./latestDispatcher";
it("delivers the final pointer position after an earlier IPC request finishes", async () => {
  vi.useFakeTimers();
  const positions: number[] = [];
  let finish!: () => void;
  const dispatcher = latestDispatcher(async (value: number) => {
    positions.push(value);
    if (value === 1)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
  });
  try {
    dispatcher.submit(1);
    await vi.advanceTimersByTimeAsync(70);
    dispatcher.submit(2);
    dispatcher.submit(3);
    await vi.advanceTimersByTimeAsync(200);
    expect(positions).toEqual([1]);
    finish();
    await vi.advanceTimersByTimeAsync(70);
    expect(positions).toEqual([1, 3]);
  } finally {
    dispatcher.dispose();
    vi.useRealTimers();
  }
});
