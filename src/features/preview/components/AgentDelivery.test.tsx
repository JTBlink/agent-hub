// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { previewApi } from "../api";
import { runHerdrAction } from "../../herdr/lib/herdrControlApi";
import { AgentDelivery } from "./AgentDelivery";
vi.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("../api", () => ({
  previewApi: {
    prepareDelivery: vi.fn(async () => ({
      context: "packet context",
      prompt: "packet prompt",
    })),
  },
}));
vi.mock("../../herdr/lib/herdrControlApi", () => ({
  getHerdrInventory: vi.fn(async () => ({
    installed: true,
    sessions: [{ name: "default", running: true }],
  })),
  getHerdrSnapshot: vi.fn(async () => ({
    workspaces: [],
    agents: [{ agent: "codex", pane_id: "pane", workspace_id: "workspace" }],
  })),
  herdrTarget: vi.fn(() => ({ session: "default", pane_id: "pane" })),
  runHerdrAction: vi.fn(),
}));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  for (const method of ["showModal", "close"])
    Object.defineProperty(HTMLDialogElement.prototype, method, {
      configurable: true,
      value: vi.fn(),
    });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  for (const method of ["showModal", "close"])
    Reflect.deleteProperty(HTMLDialogElement.prototype, method);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = async (
  verifyCurrent: () => Promise<void>,
  images: string[] = [],
  onSent = vi.fn(),
) => {
  await act(async () =>
    root.render(
      <AgentDelivery
        text="feedback"
        images={images}
        stale={false}
        verifyCurrent={verifyCurrent}
        onSent={onSent}
        onClose={() => {}}
      />,
    ),
  );
  return onSent;
};
const send = async () =>
  act(async () => {
    container
      .querySelector<HTMLButtonElement>("footer .app-button-primary")!
      .click();
  });
it("refuses stale context before packaging or writing to clipboard", async () => {
  const verify = vi.fn().mockRejectedValue(Error("page changed"));
  const sent = await render(verify, ["image"]);
  await send();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "page changed",
  );
  expect(previewApi.prepareDelivery).not.toHaveBeenCalled();
  expect(writeText).not.toHaveBeenCalled();
  expect(runHerdrAction).not.toHaveBeenCalled();
  expect(sent).not.toHaveBeenCalled();
});
it("rechecks after attachment packaging before sending to a verified Agent target", async () => {
  const verify = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(Error("changed during packaging"));
  const sent = await render(verify, ["image"]);
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = "default:pane";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await send();
  expect(previewApi.prepareDelivery).toHaveBeenCalledOnce();
  expect(verify).toHaveBeenCalledTimes(2);
  expect(runHerdrAction).not.toHaveBeenCalled();
  expect(sent).not.toHaveBeenCalled();
  verify.mockResolvedValue(undefined);
  await send();
  expect(runHerdrAction).toHaveBeenCalledExactlyOnceWith(
    { session: "default", pane_id: "pane" },
    "prompt",
    "packet prompt",
  );
  expect(sent).toHaveBeenCalledWith(false);
});
it("locks draft and target during verification, prevents duplicate sends, and cancels delivery after unmount", async () => {
  let resolve!: () => void;
  const verify = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  await render(verify);
  await act(async () => {
    const button = container.querySelector<HTMLButtonElement>(
      "footer .app-button-primary",
    )!;
    button.click();
    button.click();
  });
  expect(verify).toHaveBeenCalledOnce();
  expect(container.querySelector("textarea")!.disabled).toBe(true);
  expect(container.querySelector("select")!.disabled).toBe(true);
  await act(async () => root.render(null));
  await act(async () => resolve());
  expect(writeText).not.toHaveBeenCalled();
  expect(runHerdrAction).not.toHaveBeenCalled();
});

it("does not notify a replacement dialog after the final clipboard operation completes", async () => {
  let finish!: () => void;
  vi.mocked(writeText).mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        finish = done;
      }),
  );
  const sent = await render(async () => {});
  await send();
  expect(writeText).toHaveBeenCalledOnce();
  await act(async () => root.render(null));
  await act(async () => finish());
  expect(sent).not.toHaveBeenCalled();
});
