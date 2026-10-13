// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import { CopyPathButton } from "./CopyPathButton";

const api = vi.hoisted(() => ({
  writeText: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: api.writeText,
}));
vi.mock("sonner", () => ({
  toast: { success: api.success, error: api.error },
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

const path = "/workspace/skills/demo #中文";
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  api.writeText.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(props = {}) {
  await act(async () => root.render(<CopyPathButton path={path} {...props} />));
}
function copyButton() {
  const button = container.querySelector<HTMLButtonElement>(
    '[aria-label="复制路径"]',
  );
  if (!button) throw new Error("Missing copy path button");
  return button;
}

it("copies the full unencoded path using the icon", async () => {
  await render();
  expect(copyButton().querySelector(".lucide-copy")).not.toBeNull();
  await act(async () => copyButton().click());
  expect(api.writeText).toHaveBeenCalledExactlyOnceWith(path);
  expect(api.success).toHaveBeenCalledWith("路径已复制");
});

it("reports failures and allows copying again", async () => {
  api.writeText.mockRejectedValueOnce(new Error("Clipboard unavailable"));
  await render();
  await act(async () => copyButton().click());
  expect(api.error).toHaveBeenCalledWith("Clipboard unavailable");
  expect(api.success).not.toHaveBeenCalled();
  expect(copyButton().disabled).toBe(false);
  await act(async () => copyButton().click());
  expect(api.success).toHaveBeenCalledWith("路径已复制");
});

it("blocks repeat clicks while copying", async () => {
  let finish = () => {};
  api.writeText.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await act(async () => copyButton().click());
  expect(copyButton().disabled).toBe(true);
  expect(copyButton().getAttribute("aria-busy")).toBe("true");
  await act(async () => copyButton().click());
  expect(api.writeText).toHaveBeenCalledOnce();
  await act(async () => finish());
  expect(copyButton().disabled).toBe(false);
});

it.each([{ disabled: true }, { path: "" }])(
  "does not copy when the directory action is unavailable: %j",
  async (props) => {
    await render(props);
    expect(copyButton().disabled).toBe(true);
    await act(async () => copyButton().click());
    expect(api.writeText).not.toHaveBeenCalled();
  },
);
