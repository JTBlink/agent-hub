// @vitest-environment jsdom
import { act } from "react";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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
it("keeps a failed draft across a remote refresh and lets cancel adopt the refreshed command", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  let snapshot: AgentLaunchSnapshot = {
    revision: "first",
    defaults: { codex: `codex --config 'note=hello world'` },
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
    const search = () =>
      Array.from(host.querySelectorAll("button")).find(
        (button) => button.title === "--search",
      )!;
    await act(async () => search().click());
    const input = () => host.querySelector("input")!;
    expect(input().value).toBe(`codex --config 'note=hello world' --search`);
    const saveButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "common.save",
    )!;
    await act(async () => saveButton.click());
    expect(submitted?.instructions.hermes).toBe("hermes --yolo");
    expect(submitted?.instructions.codex).toBe(
      `codex --config 'note=hello world' --search`,
    );
    snapshot = {
      ...snapshot,
      revision: "restored",
      document: {
        ...snapshot.document,
        instructions: { codex: "codex --no-alt-screen" },
      },
    };
    await act(render);
    expect(input().value).toBe(`codex --config 'note=hello world' --search`);
    const cancel = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "common.cancel",
    )!;
    await act(async () => cancel.click());
    expect(input().value).toBe("codex --no-alt-screen");
  } finally {
    await act(async () => root.unmount());
  }
});
