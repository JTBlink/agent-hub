// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAutomationNextRunRefresh } from "./useAutomationNextRunRefresh";

type Tasks = Parameters<typeof useAutomationNextRunRefresh>[0];
const refresh = vi.fn();
let root: Root, host: HTMLDivElement;
let visibility: PropertyDescriptor | undefined;
function Harness({ tasks }: { tasks: Tasks }) {
  useAutomationNextRunRefresh(tasks, refresh);
  return null;
}
async function render(tasks: Tasks) {
  await act(async () => root.render(<Harness tasks={tasks} />));
}
const task = (next_run: string) => ({
  next_run,
  status: "active" as const,
  definition: null,
  installation: "installed",
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime("2026-10-31T12:29:00+08:00");
  refresh.mockReset();
  visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (visibility)
    Object.defineProperty(document, "visibilityState", visibility);
  else Reflect.deleteProperty(document, "visibilityState");
});
it("refreshes just after the nearest run and moves the timer when the schedule changes", async () => {
  await render([
    task("2026-10-31T12:30:00+08:00"),
    task("2026-10-31T12:45:00+08:00"),
  ]);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1_000));
  expect(refresh).toHaveBeenCalledTimes(1);
  await render([task("2026-10-31T12:45:00+08:00")]);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(14 * 60_000));
  expect(refresh).toHaveBeenCalledTimes(2);
});
it("keeps a failed or stale snapshot on a bounded retry rather than spinning", async () => {
  await render([task("2026-10-31T12:00:00+08:00")]);
  await act(async () => vi.advanceTimersByTimeAsync(59_000));
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1_000));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(refresh).toHaveBeenCalledTimes(2);
});
it("cancels the timer on pause and ignores absent or uninstalled predictions", async () => {
  await render([task("2026-10-31T12:30:00+08:00")]);
  await render([
    { ...task("2026-10-31T12:30:00+08:00"), status: "paused" },
    { ...task("2026-10-31T12:30:00+08:00"), installation: "uninstalled" },
    task("unknown"),
  ]);
  await act(async () => vi.advanceTimersByTimeAsync(120_000));
  expect(refresh).not.toHaveBeenCalled();
});
it("leaves hidden pages to the existing visibility revalidation", async () => {
  await render([task("2026-10-31T12:30:00+08:00")]);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  await act(async () => vi.advanceTimersByTimeAsync(120_000));
  expect(refresh).not.toHaveBeenCalled();
});
