// @vitest-environment jsdom
import { herdrDeliveryAdapter } from "../../herdr/deliveryAdapter";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { previewApi } from "../api";
import {
  getHerdrInventory,
  getHerdrSnapshot,
  runHerdrAction,
} from "../../herdr/lib/herdrControlApi";
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
    workspaces: [
      { workspace_id: "workspace", label: "Web", directory: "~/projects/web" },
    ],
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
        adapter={herdrDeliveryAdapter}
        text="feedback"
        images={images}
        stale={false}
        verifyCurrent={verifyCurrent}
        onSent={onSent}
        onClose={() => {}}
      />,
    ),
  );
  await changeSelect(0, "copy");
  return onSent;
};
const changeSelect = async (index: number, value: string) =>
  act(async () => {
    const select = container.querySelectorAll("select")[index];
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
const chooseAgent = async () => {
  await changeSelect(0, "herdr");
  await changeSelect(1, "default");
  await changeSelect(2, "workspace");
  await changeSelect(3, "pane");
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
  await chooseAgent();
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

it("requires each level of the Herdr target and clears descendants when the session changes", async () => {
  await render(async () => {});
  await changeSelect(0, "herdr");
  const button = () =>
    container.querySelector<HTMLButtonElement>("footer .app-button-primary")!;
  expect(button().disabled).toBe(true);
  await changeSelect(1, "default");
  expect(getHerdrSnapshot).toHaveBeenCalledWith("default");
  await changeSelect(2, "workspace");
  expect(button().disabled).toBe(true);
  await changeSelect(3, "pane");
  expect(button().disabled).toBe(false);
  expect(container.textContent).toContain("default → ~/projects/web");
  await changeSelect(1, "");
  expect(button().disabled).toBe(true);
  expect(container.querySelectorAll("select")[2].value).toBe("");
  expect(container.querySelectorAll("select")[3].value).toBe("");
});
it("shows stopped sessions and preserves feedback when a target rejects delivery", async () => {
  const sent = await render(async () => {});
  await chooseAgent();
  vi.mocked(runHerdrAction).mockRejectedValueOnce(
    Error("Target identity changed"),
  );
  await send();
  expect(sent).not.toHaveBeenCalled();
  expect(container.querySelector("textarea")?.value).toBe("feedback");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Target identity changed",
  );
  expect(container.textContent).toContain("preview.deliveryFailed");
  expect(runHerdrAction).toHaveBeenCalledOnce();
});
it("offers copy when Herdr is missing and disables stopped sessions", async () => {
  await render(async () => {});
  vi.mocked(getHerdrInventory).mockResolvedValueOnce({
    installed: false,
    sessions: [],
  });
  await changeSelect(0, "herdr");
  expect(container.textContent).toContain("preview.herdrMissing");
  // Refresh discovers the latest inventory without sending any input.
  vi.mocked(getHerdrInventory).mockResolvedValueOnce({
    installed: true,
    sessions: [{ name: "offline", running: false, default: false }],
  });
  const refresh = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "preview.refreshTargets",
  )!;
  await act(async () => refresh.click());
  const stopped = container.querySelector<HTMLOptionElement>(
    'option[value="offline"]',
  );
  expect(stopped?.disabled).toBe(true);
  expect(container.textContent).toContain("preview.herdrStopped");
  expect(
    container.querySelector<HTMLButtonElement>("footer .app-button-primary")
      ?.disabled,
  ).toBe(true);
  await changeSelect(0, "copy");
  await send();
  expect(writeText).toHaveBeenCalledWith("feedback");
});

it("packages multibyte feedback above the Herdr byte limit", async () => {
  await render(async () => {});
  await chooseAgent();
  await act(async () => {
    const input = container.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, "修改".repeat(6000));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await send();
  expect(previewApi.prepareDelivery).toHaveBeenCalledWith(
    "修改".repeat(6000),
    [],
  );
  expect(runHerdrAction).toHaveBeenCalledWith(
    expect.anything(),
    "prompt",
    "packet prompt",
  );
});

it("does not restore a snapshot after the session selection is cleared", async () => {
  await render(async () => {});
  await changeSelect(0, "herdr");
  const snapshot = await getHerdrSnapshot("default");
  let resolve!: (value: typeof snapshot) => void;
  vi.mocked(getHerdrSnapshot).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await changeSelect(1, "default");
  await changeSelect(1, "");
  await act(async () => resolve(snapshot));
  expect(container.querySelectorAll("select")[2].disabled).toBe(true);
  expect(container.querySelector('option[value="workspace"]')).toBeNull();
});
it("displays the page, feedback, element screenshot and its exact bounds before sending", async () => {
  await act(async () =>
    root.render(
      <AgentDelivery
        adapter={herdrDeliveryAdapter}
        text="feedback"
        images={["png"]}
        stale={false}
        page={{
          title: "Page title",
          address: "https://example.invalid/page",
          revision: "r1",
        }}
        annotations={[
          {
            id: "note",
            tabId: "page",
            revision: "r1",
            selector: "#action",
            text: "Before",
            note: "Change button",
            screenshot: "png",
            bounds: { x: 12, y: 24, width: 80, height: 40 },
          },
        ]}
        verifyCurrent={async () => {}}
        onSent={() => {}}
        onClose={() => {}}
      />,
    ),
  );
  expect(container.textContent).toContain("Page title");
  expect(container.textContent).toContain("https://example.invalid/page");
  expect(container.textContent).toContain("Change button");
  expect(container.textContent).toContain("x=12, y=24, 80 × 40");
  expect(container.querySelector("img")?.src).toBe("data:image/png;base64,png");
  expect(runHerdrAction).not.toHaveBeenCalled();
});
