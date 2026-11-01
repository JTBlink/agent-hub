// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import * as api from "../../lib/tauri";
import { NetworkSettings } from "./NetworkSettings";

vi.mock("../../lib/tauri", () => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api.getSettings).mockResolvedValue("http://127.0.0.1:8080");
  vi.mocked(api.setSettings).mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<NetworkSettings />));
}
const input = () => host.querySelector<HTMLInputElement>("input")!;
async function edit(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function save() {
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")!.click(),
  );
}
it("loads the existing app proxy and saves edits or an explicit clear to the same setting", async () => {
  await render();
  expect(api.getSettings).toHaveBeenCalledExactlyOnceWith("proxy_url");
  expect(input().value).toBe("http://127.0.0.1:8080");
  await edit("  socks5://127.0.0.1:1080  ");
  await save();
  expect(api.setSettings).toHaveBeenLastCalledWith(
    "proxy_url",
    "socks5://127.0.0.1:1080",
  );
  expect(input().value).toBe("socks5://127.0.0.1:1080");
  await edit("");
  await save();
  expect(api.setSettings).toHaveBeenLastCalledWith("proxy_url", "");
});
it("rejects unsupported addresses and retains the draft when saving fails", async () => {
  await render();
  await edit("ftp://proxy.example.invalid");
  await save();
  expect(api.setSettings).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith("settings.proxyUrlInvalid");
  await edit("https://proxy.example.invalid:8080");
  vi.mocked(api.setSettings).mockRejectedValueOnce(new Error("save failed"));
  await save();
  expect(input().value).toBe("https://proxy.example.invalid:8080");
  expect(host.querySelector("fieldset")?.disabled).toBe(false);
  await save();
  expect(api.setSettings).toHaveBeenCalledTimes(2);
});
