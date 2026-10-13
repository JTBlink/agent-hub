// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAgentSettings } from "./useAgentSettings";
const api = vi.hoisted(() => ({ setCustomToolPath: vi.fn() }));
const app = vi.hoisted(() => ({ tools: [], refreshTools: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("../lib/tauri", () => api);
vi.mock("../context/AppContext", () => ({ useApp: () => app }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({ toast }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  app.refreshTools.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function Subject() {
  const state = useAgentSettings();
  return (
    <>
      <button onClick={() => state.startEditPath("codex", "~/.codex/skills")}>
        Edit
      </button>
      {state.editingPathKey && (
        <fieldset disabled={state.savingPath}>
          <input
            value={state.editingPathValue}
            onChange={(e) => state.setEditingPathValue(e.target.value)}
          />
          <button onClick={() => void state.handleSavePath()}>Save</button>
        </fieldset>
      )}
    </>
  );
}
it("retains the Agent path editor on failure and blocks duplicate saves until retry succeeds", async () => {
  let fail: ((error: unknown) => void) | undefined;
  api.setCustomToolPath.mockImplementation(
    () =>
      new Promise<void>((_, reject) => {
        fail = reject;
      }),
  );
  await act(async () => root.render(<Subject />));
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button")!.click(),
  );
  const save = container.querySelector<HTMLButtonElement>("fieldset button")!;
  await act(async () => {
    save.click();
    save.click();
  });
  expect(api.setCustomToolPath).toHaveBeenCalledOnce();
  expect(save.matches(":disabled")).toBe(true);
  await act(async () => fail?.(new Error("save failed")));
  expect(container.querySelector<HTMLInputElement>("input")?.value).toBe(
    "~/.codex/skills",
  );
  expect(save.matches(":disabled")).toBe(false);
  expect(toast.error).toHaveBeenCalledOnce();
  api.setCustomToolPath.mockResolvedValue(undefined);
  await act(async () => save.click());
  expect(container.querySelector("input")).toBeNull();
});
