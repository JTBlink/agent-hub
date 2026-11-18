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
