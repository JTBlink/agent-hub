// @vitest-environment jsdom
import { act } from "react";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AgentLaunchEditor } from "./AgentLaunchEditor";
import { useAgentLaunchSettings } from "../../hooks/useAgentLaunchSettings";
import { getAgentLaunchSettings } from "../../lib/tauri";
import type {
  AgentLaunchDocument,
  AgentLaunchSnapshot,
} from "../../lib/agentLaunchConfig";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../lib/tauri", () => ({ getAgentLaunchSettings: vi.fn() }));

it("keeps launch controls visible while loading and fills them with the saved command", async () => {
  let resolve!: (snapshot: AgentLaunchSnapshot) => void;
  vi.mocked(getAgentLaunchSettings).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const host = document.createElement("div");
  const root = createRoot(host);
  function Settings() {
    const controller = useAgentLaunchSettings();
    return <AgentLaunchEditor agentKey="codex" controller={controller} />;
  }
  try {
    await act(async () => root.render(<Settings />));
    const input = host.querySelector("input")!;
    const search = host.querySelector<HTMLButtonElement>('[title="--search"]')!;
    expect(input).not.toBeNull();
    expect(input.placeholder).toBe("common.loading");
    expect(input.disabled).toBe(true);
    expect(search.disabled).toBe(true);
    expect(host.textContent).toContain("agentLaunch.setDefault");
    await act(async () =>
      resolve({
        revision: "saved",
        defaults: { codex: "codex" },
        document: {
          schema_version: 1,
          default_agent: "codex",
          instructions: { codex: "codex --search --no-alt-screen" },
        },
      }),
    );
    expect(host.querySelector("input")).toBe(input);
    expect(input.value).toBe("codex --search --no-alt-screen");
    expect(input.disabled).toBe(false);
    expect(search.disabled).toBe(false);
    expect(search.getAttribute("aria-pressed")).toBe("true");
    expect(host.textContent).toContain("agentLaunch.default");
  } finally {
    await act(async () => root.unmount());
  }
});

it("keeps unloaded controls disabled after a read failure and recovers on retry", async () => {
  vi.mocked(getAgentLaunchSettings)
    .mockRejectedValueOnce(new Error("Read failed"))
    .mockResolvedValueOnce({
      revision: "retry",
      defaults: { codex: "codex --search" },
      document: { schema_version: 1, default_agent: "codex", instructions: {} },
    });
  const host = document.createElement("div");
  const root = createRoot(host);
  function Settings() {
    const controller = useAgentLaunchSettings();
    return (
      <>
        {controller.error && (
          <button onClick={() => void controller.reload()}>Retry</button>
        )}
        <AgentLaunchEditor agentKey="codex" controller={controller} />
      </>
    );
  }
  try {
    await act(async () => root.render(<Settings />));
    const input = host.querySelector("input")!;
    expect(input.placeholder).toBe("common.error");
    expect(input.disabled).toBe(true);
    expect(input.value).toBe("");
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click(),
    );
    expect(input.value).toBe("codex --search");
    expect(input.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});
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
