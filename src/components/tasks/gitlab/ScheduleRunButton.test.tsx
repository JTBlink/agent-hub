// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScheduleRunButton } from "./ScheduleRunButton";

const api = vi.hoisted(() => ({
  run: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../../../lib/repositoryScheduleApi", () => ({
  runRepositorySchedule: api.run,
}));
vi.mock("sonner", () => ({
  toast: { success: api.success, error: api.error },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
let root: Root;
let host: HTMLDivElement;
const refresh = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.useFakeTimers();
  api.run.mockReset().mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () =>
    root.render(
      <ScheduleRunButton
        bindingId="repo-1"
        scheduleId={75}
        title="Daily checks"
        onAccepted={refresh}
      />,
    ),
  );
}
function button() {
  return host.querySelector("button")!;
}

it("runs the selected schedule once, waits for acceptance and refreshes asynchronous creation", async () => {
  let accept: (() => void) | undefined;
  api.run.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
  );
  await render();
  await act(async () => {
    button().click();
    button().click();
  });
  expect(api.run).toHaveBeenCalledExactlyOnceWith("repo-1", 75);
  expect(button().disabled).toBe(true);
  expect(button().getAttribute("aria-busy")).toBe("true");
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => accept?.());
  expect(api.success).toHaveBeenCalledWith("schedules.runAccepted");
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(button().disabled).toBe(true);
  await act(async () => vi.advanceTimersByTime(5000));
  expect(refresh).toHaveBeenCalledTimes(3);
  await act(async () => vi.advanceTimersByTime(55_000));
  expect(button().disabled).toBe(false);
  expect(api.run).toHaveBeenCalledTimes(1);
});

it("reports permission failures and leaves the action available without retrying", async () => {
  api.run.mockRejectedValue({ kind: "permission", message: "Denied" });
  await render();
  await act(async () => button().click());
  expect(api.error).toHaveBeenCalledWith("tasks.errors.permission");
  expect(button().disabled).toBe(false);
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(api.run).toHaveBeenCalledTimes(1);
});

it("reports uncertain delivery and cancels refresh timers when leaving the row", async () => {
  api.run.mockRejectedValueOnce({ kind: "network", message: "Timed out" });
  await render();
  await act(async () => button().click());
  expect(api.error).toHaveBeenCalledWith("schedules.runUncertain");
  await act(async () => button().click());
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => root.render(null));
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(api.run).toHaveBeenCalledTimes(2);
});
