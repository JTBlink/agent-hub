// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AgentLaunchEditor } from "./AgentLaunchEditor";
import type {
  AgentLaunchDocument,
  AgentLaunchSnapshot,
} from "../../lib/agentLaunchConfig";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("saves scheme edits without copying legacy commands and preserves a conflicting draft until cancel", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  let snapshot: AgentLaunchSnapshot = {
    revision: "initial",
    defaults: { codex: "codex --dangerously-bypass-approvals-and-sandbox" },
    document: {
      schema_version: 1,
      default_agent: "hermes",
      instructions: { hermes: "hermes --yolo" },
    },
  };
  let submitted: AgentLaunchDocument | undefined;
  const save = vi.fn(
    async (change: (document: AgentLaunchDocument) => AgentLaunchDocument) => {
      submitted = change(snapshot.document);
      return false;
    },
  );
  const render = () =>
    root.render(
      <AgentLaunchEditor
        agentKey="codex"
        controller={{
          snapshot,
          busy: false,
          error: "",
          reload: async () => {},
          save,
        }}
      />,
    );
  try {
    await act(render);
    const input = () => host.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input(), "codex-yolo");
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "common.save")!
        .click(),
    );
    expect(submitted?.schemes?.codex.items[0].instruction).toBe("codex-yolo");
    expect(submitted?.schemes?.hermes.items[0].instruction).toBe(
      "hermes --yolo",
    );
    expect(submitted?.instructions).toBeUndefined();
    snapshot = {
      ...snapshot,
      revision: "restored",
      document: {
        ...snapshot.document,
        instructions: { codex: "restored-codex" },
      },
    };
    await act(render);
    expect(input().value).toBe("codex-yolo");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "agentLaunch.changed",
    );
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "common.cancel")!
        .click(),
    );
    expect(input().value).toBe("restored-codex");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("applies the old shortcut buttons and reset to the selected scheme only", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const original = "codex --no-alt-screen";
  const defaultInstruction = "codex";
  const snapshot: AgentLaunchSnapshot = {
    revision: "initial",
    defaults: { codex: defaultInstruction },
    document: {
      schema_version: 2,
      default_agent: "hermes",
      schemes: {
        codex: {
          default_id: "default",
          items: [
            { id: "default", name: "Default", instruction: original },
            {
              id: "custom",
              name: "Custom",
              instruction: "codex-wrapper preset",
            },
          ],
        },
      },
    },
  };
  const save = vi.fn(
    async (change: (doc: AgentLaunchDocument) => AgentLaunchDocument) => {
      expect(change(snapshot.document).schemes?.codex).toEqual({
        default_id: "default",
        items: [
          { id: "default", name: "Default", instruction: original },
          { id: "custom", name: "Custom", instruction: defaultInstruction },
        ],
      });
      return false;
    },
  );
  const input = () => host.querySelector<HTMLInputElement>("input")!;
  const button = (label: string) =>
    [...host.querySelectorAll("button")].find(
      (item) => item.textContent === label,
    )!;
  try {
    await act(async () =>
      root.render(
        <AgentLaunchEditor
          agentKey="codex"
          controller={{
            snapshot,
            save,
            error: "",
            busy: false,
            reload: async () => {},
          }}
        />,
      ),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="combobox"]')!.click(),
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
        .find((item) => item.textContent === "Custom")!
        .click(),
    );
    const search = button("agentLaunch.shortcuts.search");
    expect(search.getAttribute("aria-pressed")).toBe("false");
    await act(async () => search.click());
    expect(input().value).toBe("codex-wrapper preset --search");
    expect(search.getAttribute("aria-pressed")).toBe("true");
    await act(async () => button("agentLaunch.reset").click());
    expect(input().value).toBe(defaultInstruction);
    await act(async () =>
      input().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(save).toHaveBeenCalledOnce();
    await act(async () =>
      input().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(input().value).toBe("codex-wrapper preset");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("keeps shortcuts interactive during a slow save and flushes the latest edit when leaving", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const snapshot: AgentLaunchSnapshot = {
    revision: "initial",
    defaults: { codex: "codex" },
    document: { schema_version: 2, default_agent: "codex", schemes: {} },
  };
  let stored = snapshot.document;
  let finishSave: () => void = () => {};
  const save = vi.fn(
    async (change: (current: AgentLaunchDocument) => AgentLaunchDocument) => {
      stored = change(stored);
      if (save.mock.calls.length === 1) {
        await new Promise<void>((resolve) => {
          finishSave = resolve;
        });
      }
      return true;
    },
  );
  const render = (busy: boolean) =>
    root.render(
      <AgentLaunchEditor
        agentKey="codex"
        saveOnUnmount
        controller={{ snapshot, busy, save, error: "", reload: async () => {} }}
      />,
    );
  const button = (label: string) =>
    [...host.querySelectorAll("button")].find(
      (item) => item.textContent === label,
    )!;
  try {
    await act(async () => render(false));
    await act(async () => button("agentLaunch.shortcuts.search").click());
    await act(async () => button("common.save").click());
    await act(async () => render(true));
    const scrollback = button("agentLaunch.shortcuts.scrollback");
    expect(scrollback.matches(":disabled")).toBe(false);
    await act(async () => scrollback.click());
    expect(host.querySelector("input")?.value).toBe(
      "codex --search --no-alt-screen",
    );
    expect(save).toHaveBeenCalledOnce();
    await act(async () => root.render(null));
    await act(async () => finishSave());
    expect(save).toHaveBeenCalledTimes(2);
    expect(stored.schemes?.codex.items[0].instruction).toBe(
      "codex --search --no-alt-screen",
    );
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
