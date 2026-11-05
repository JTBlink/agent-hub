// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { previewApi } from "../api";
import { AgentDelivery } from "./AgentDelivery";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("../api", () => ({
  previewApi: {
    prepareDelivery: vi.fn(async () => ({
      context: "packet context",
      prompt: "packet prompt",
    })),
  },
}));
const deliver = vi.fn();
const resolveCurrent = vi.fn();
const adapter = { id: "test", label: "Agent", resolveCurrent };
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  resolveCurrent.mockResolvedValue({ send: deliver });
  deliver.mockResolvedValue(undefined);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = async (
  verifyCurrent = vi.fn(async () => {}),
  images: string[] = [],
  text = "feedback",
  onSent = vi.fn(),
  copy = false,
) => {
  await act(async () =>
    root.render(
      <AgentDelivery
        adapter={copy ? undefined : adapter}
        workspacePath="/workspace/site"
        text={text}
        images={images}
        disabled={false}
        verifyCurrent={verifyCurrent}
        onSent={onSent}
      />,
    ),
  );
  return onSent;
};
const send = async () =>
  act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[type="submit"]')!
      .click(),
  );
it("sends to the current workspace without a dialog or target selection", async () => {
  const sent = await render();
  expect(container.querySelector("dialog, select")).toBeNull();
  expect(resolveCurrent).not.toHaveBeenCalled();
  await send();
  expect(resolveCurrent).toHaveBeenCalledExactlyOnceWith(
    "/workspace/site",
    undefined,
  );
  expect(deliver).toHaveBeenCalledExactlyOnceWith(
    "feedback",
    expect.any(Function),
  );
  expect(sent).toHaveBeenCalledWith(false);
});
it("rejects stale context before discovering a target or packaging files", async () => {
  await render(vi.fn().mockRejectedValue(Error("page changed")), ["image"]);
  await send();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "page changed",
  );
  expect(resolveCurrent).not.toHaveBeenCalled();
  expect(previewApi.prepareDelivery).not.toHaveBeenCalled();
  expect(deliver).not.toHaveBeenCalled();
});
it("rechecks after target discovery and attachment packaging", async () => {
  const verify = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(Error("changed during packaging"));
  await render(verify, ["image"]);
  await send();
  expect(previewApi.prepareDelivery).toHaveBeenCalledWith("feedback", [
    "image",
  ]);
  expect(verify).toHaveBeenCalledTimes(3);
  expect(deliver).not.toHaveBeenCalled();
});
it("prevents duplicate sends and cancels pending verification when the panel closes", async () => {
  let finish!: () => void;
  const verify = vi.fn(
    () =>
      new Promise<void>((done) => {
        finish = done;
      }),
  );
  await render(verify);
  await act(async () => {
    const button = container.querySelector<HTMLButtonElement>("button")!;
    button.click();
    button.click();
  });
  expect(verify).toHaveBeenCalledOnce();
  expect(container.querySelector("button")!.disabled).toBe(true);
  await act(async () => root.render(null));
  await act(async () => finish());
  expect(deliver).not.toHaveBeenCalled();
});
it("keeps feedback available when no current Agent can receive it", async () => {
  resolveCurrent.mockResolvedValue(null);
  const sent = await render();
  await send();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "preview.currentAgentUnavailable",
  );
  expect(sent).not.toHaveBeenCalled();
  expect(deliver).not.toHaveBeenCalled();
  expect(container.querySelector("button")!.disabled).toBe(false);
});
it("packages multibyte text by byte length and preserves the clipboard fallback", async () => {
  await render(undefined, [], "修改".repeat(6000));
  await send();
  expect(previewApi.prepareDelivery).toHaveBeenCalledWith(
    "修改".repeat(6000),
    [],
  );
  expect(deliver).toHaveBeenCalledWith("packet prompt", expect.any(Function));
  const sent = await render(undefined, ["image"], "feedback", vi.fn(), true);
  await send();
  expect(writeText).toHaveBeenCalledWith("packet context");
  expect(sent).toHaveBeenCalledWith(true);
});
it("does not report success to a replacement panel after the final send completes", async () => {
  let finish!: () => void;
  deliver.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        finish = done;
      }),
  );
  const sent = await render();
  await send();
  await act(async () => root.render(null));
  await act(async () => finish());
  expect(sent).not.toHaveBeenCalled();
});
