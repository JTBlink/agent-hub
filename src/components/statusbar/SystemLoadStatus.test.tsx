// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../../i18n/zh.json";
import { getSystemLoad } from "../../lib/tauri";
import type { SystemLoadSnapshot } from "../../lib/systemLoad";
import { SystemLoadStatus } from "./SystemLoadStatus";

vi.mock("../../lib/tauri", () => ({ getSystemLoad: vi.fn() }));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
const snapshot: SystemLoadSnapshot = {
  cpu_percent: 37,
  memory_used_bytes: 23.68 * 1024 ** 3,
  memory_total_bytes: 32 * 1024 ** 3,
  disk_available_bytes: 128 * 1024 ** 3,
  disk_total_bytes: 1024 ** 4,
};
let container: HTMLDivElement;
let root: Root;
let visible = true;

async function render() {
  await act(async () =>
    root.render(
      <I18nextProvider i18n={i18n}>
        <SystemLoadStatus />
      </I18nextProvider>,
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  visible = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    visible ? "visible" : "hidden",
  );
  vi.mocked(getSystemLoad).mockReset().mockResolvedValue(snapshot);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("shows machine CPU and RAM percentages and memory capacity in the tooltip", async () => {
  await render();
  expect(container.textContent).toBe("CPU37%MEM74%DISK128.0 GiB 可用");
  expect(container.querySelector('[title*="23.7 / 32.0 GiB"]')).not.toBeNull();
  expect(
    container.querySelector('[title*="剩余 128.0 GiB，总计 1.0 TiB"]'),
  ).not.toBeNull();
});

it("shows an unknown first CPU sample and replaces stale readings after failure", async () => {
  vi.mocked(getSystemLoad).mockResolvedValueOnce({
    ...snapshot,
    cpu_percent: null,
  });
  await render();
  expect(container.textContent).toBe("CPU—MEM74%DISK128.0 GiB 可用");
  await act(async () => vi.advanceTimersByTime(2000));
  expect(container.textContent).toBe("CPU37%MEM74%DISK128.0 GiB 可用");
  vi.mocked(getSystemLoad).mockRejectedValueOnce(new Error("Unavailable"));
  await act(async () => vi.advanceTimersByTime(2000));
  expect(container.textContent).toBe("CPU—MEM—DISK—");
  expect(container.querySelector('[title="系统负载暂不可用"]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(2000));
  expect(container.textContent).toBe("CPU37%MEM74%DISK128.0 GiB 可用");
});

it("pauses requests while hidden and resumes when visible without overlapping requests", async () => {
  visible = false;
  await render();
  await act(async () => vi.advanceTimersByTime(6000));
  expect(getSystemLoad).not.toHaveBeenCalled();
  let finish: (value: SystemLoadSnapshot) => void = () => {};
  vi.mocked(getSystemLoad).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  visible = true;
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => vi.advanceTimersByTime(6000));
  expect(getSystemLoad).toHaveBeenCalledTimes(1);
  await act(async () => finish(snapshot));
  expect(container.textContent).toBe("CPU37%MEM74%DISK128.0 GiB 可用");
});

it("keeps CPU and memory visible when disk capacity is unavailable", async () => {
  vi.mocked(getSystemLoad).mockResolvedValue({
    ...snapshot,
    disk_available_bytes: null,
    disk_total_bytes: null,
  });
  await render();
  expect(container.textContent).toBe("CPU37%MEM74%DISK—");
  expect(container.querySelector('[title="磁盘空间暂不可用"]')).not.toBeNull();
});

it("shows a full disk as zero available capacity", async () => {
  vi.mocked(getSystemLoad).mockResolvedValue({
    ...snapshot,
    disk_available_bytes: 0,
  });
  await render();
  expect(container.textContent).toContain("DISK0.0 GiB 可用");
});

it.each([0, 9 * 1024 ** 3, 10 * 1024 ** 3 - 1])(
  "warns in red when available disk bytes are %s, below 10 GiB",
  async (disk_available_bytes) => {
    vi.mocked(getSystemLoad).mockResolvedValue({
      ...snapshot,
      disk_available_bytes,
    });
    await render();
    const disk = container.querySelector('[aria-label*="磁盘空间不足"]');
    expect(disk).not.toBeNull();
    expect(disk?.classList.contains("text-danger")).toBe(true);
    expect(disk?.lastElementChild?.classList.contains("text-danger")).toBe(
      true,
    );
  },
);

it("clears the disk warning at exactly 10 GiB and when disk sampling fails", async () => {
  vi.mocked(getSystemLoad).mockResolvedValue({
    ...snapshot,
    disk_available_bytes: 9 * 1024 ** 3,
  });
  await render();
  expect(
    container.querySelector('[aria-label*="磁盘空间不足"]'),
  ).not.toBeNull();

  vi.mocked(getSystemLoad).mockResolvedValue({
    ...snapshot,
    disk_available_bytes: 10 * 1024 ** 3,
  });
  await act(async () => vi.advanceTimersByTime(2000));
  expect(container.querySelector('[aria-label*="磁盘空间不足"]')).toBeNull();
  expect(container.querySelector(".text-danger")).toBeNull();
  expect(container.textContent).toContain("DISK10.0 GiB 可用");

  vi.mocked(getSystemLoad).mockResolvedValue({
    ...snapshot,
    disk_available_bytes: 0,
  });
  await act(async () => vi.advanceTimersByTime(2000));
  expect(
    container.querySelector('[aria-label*="磁盘空间不足"]'),
  ).not.toBeNull();
  vi.mocked(getSystemLoad).mockRejectedValueOnce(new Error("Unavailable"));
  await act(async () => vi.advanceTimersByTime(2000));
  expect(container.querySelector(".text-danger")).toBeNull();
  expect(container.textContent).toContain("DISK—");
});
