// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import { AutomationRunOutputPanel } from "./AutomationRunOutput";

const api = vi.hoisted(() => ({
  output: vi.fn(),
  write: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../lib/tauri", () => ({ getAutomationOutput: api.output }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: api.write,
}));
vi.mock("sonner", () => ({
  toast: { success: api.success, error: api.error },
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
const content =
  "Cleanup completed\nSkipped protected cache entry: ~/.npm/cache/demo\n中文 <raw> & output\n";
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  api.write.mockReset().mockResolvedValue(undefined);
  api.output.mockReset().mockResolvedValue({
    content,
    available: true,
    truncated: false,
    kind: "system",
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(has_output = true) {
  await act(async () =>
    root.render(
      <AutomationRunOutputPanel
        taskId="fixture-task"
        refreshKey={0}
        run={{
          id: "run-1",
          started_at: null,
          finished_at: null,
          status: "error",
          exit_code: 1,
          has_output,
        }}
      />,
    ),
  );
}
function button() {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="复制输出"]',
  )!;
}
it("copies the displayed raw output, including newlines and Unicode", async () => {
  await render();
  expect(button().disabled).toBe(false);
  expect(button().querySelector(".lucide-copy")).not.toBeNull();
  await act(async () => button().click());
  expect(api.write).toHaveBeenCalledExactlyOnceWith(content);
  expect(api.success).toHaveBeenCalledWith("执行输出已复制");
});
it("does not copy loading placeholders or empty output", async () => {
  let resolve!: (value: unknown) => void;
  api.output.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render();
  expect(button().disabled).toBe(true);
  await act(async () =>
    resolve({ content: "", available: true, truncated: false, kind: "system" }),
  );
  expect(button().disabled).toBe(true);
  expect(api.write).not.toHaveBeenCalled();
});
it("prevents duplicate copies while pending and allows retry after a clipboard failure", async () => {
  let reject!: (cause: Error) => void;
  api.write.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  await render();
  await act(async () => {
    button().click();
    button().click();
  });
  expect(api.write).toHaveBeenCalledTimes(1);
  expect(button().disabled).toBe(true);
  await act(async () => reject(new Error("clipboard unavailable")));
  expect(api.error).toHaveBeenCalledWith("clipboard unavailable");
  expect(button().disabled).toBe(false);
  await act(async () => button().click());
  expect(api.write).toHaveBeenCalledTimes(2);
});
it("keeps copy disabled when this run has no saved output", async () => {
  await render(false);
  expect(button().disabled).toBe(true);
  expect(api.output).not.toHaveBeenCalled();
});
