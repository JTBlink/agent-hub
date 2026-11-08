// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useAgentLaunchSettings } from "./useAgentLaunchSettings";
import { useDefaultAgentKey } from "./useDefaultAgentKey";
import { AgentLaunchEditor } from "../components/settings/AgentLaunchEditor";
import { getAgentLaunchSettings, saveAgentLaunchSettings } from "../lib/tauri";
import type { AgentLaunchSnapshot } from "../lib/agentLaunchConfig";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../lib/tauri", () => ({
  getAgentLaunchSettings: vi.fn(),
  saveAgentLaunchSettings: vi.fn(),
}));

it("synchronizes saved commands and default selection across entries while preserving drafts and ignoring an older initial read", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const initial: AgentLaunchSnapshot = {
    revision: "initial",
    defaults: { codex: "codex" },
    document: { schema_version: 1, default_agent: "codex", instructions: {} },
  };
  let finishInitial!: (snapshot: AgentLaunchSnapshot) => void;
  vi.mocked(getAgentLaunchSettings)
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce(initial)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishInitial = resolve;
      }),
    );
  vi.mocked(saveAgentLaunchSettings).mockImplementation(async (document) => ({
    ...initial,
    revision: "saved",
    document,
  }));
  function Entry({ id }: { id: string }) {
    const controller = useAgentLaunchSettings();
    return (
      <section id={id}>
        <AgentLaunchEditor agentKey="codex" controller={controller} />
        <button
          onClick={() =>
            void controller.save((current) => ({
              ...current,
              default_agent: "hermes",
            }))
          }
        >
          Use Hermes
        </button>
      </section>
    );
  }
  function DefaultSelection() {
    return <output>{useDefaultAgentKey()}</output>;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  const click = async (entry: Element, label: string) => {
    const button = [...entry.querySelectorAll("button")].find(
      (item) => item.title === label || item.textContent === label,
    )!;
    await act(async () => button.click());
  };
  try {
    await act(async () =>
      root.render(
        <>
          <Entry id="settings" />
          <Entry id="sidebar" />
          <DefaultSelection />
        </>,
      ),
    );
    const settings = host.querySelector("#settings")!;
    const sidebar = host.querySelector("#sidebar")!;
    await click(sidebar, "--no-alt-screen");
    await click(settings, "--search");
    vi.mocked(saveAgentLaunchSettings).mockRejectedValueOnce(
      new Error("Conflict"),
    );
    await click(settings, "common.save");
    expect(sidebar.querySelector('[role="alert"]')).toBeNull();
    await click(settings, "common.save");
    expect(sidebar.querySelector("input")?.value).toBe("codex --no-alt-screen");
    expect(sidebar.querySelector('[role="alert"]')?.textContent).toContain(
      "codex --search",
    );
    await click(sidebar, "common.cancel");
    expect(sidebar.querySelector("input")?.value).toBe("codex --search");
    expect(
      sidebar.querySelector('[title="--search"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    await click(settings, "Use Hermes");
    expect(host.querySelector("output")?.textContent).toBe("hermes");
    await act(async () => finishInitial(initial));
    expect(host.querySelector("output")?.textContent).toBe("hermes");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("queues a second save against the snapshot produced by the first save", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const initial: AgentLaunchSnapshot = {
    revision: "initial",
    defaults: { codex: "codex" },
    document: { schema_version: 1, default_agent: "codex", instructions: {} },
  };
  vi.mocked(getAgentLaunchSettings).mockResolvedValue(initial);
  let releaseFirst!: (snapshot: AgentLaunchSnapshot) => void;
  let calls = 0;
  vi.mocked(saveAgentLaunchSettings).mockImplementation(async (document) => {
    calls += 1;
    if (calls === 1)
      return new Promise((resolve) => {
        releaseFirst = () =>
          resolve({ ...initial, revision: "first", document });
      });
    return { ...initial, revision: "second", document };
  });
  function Entry() {
    const controller = useAgentLaunchSettings();
    return (
      <>
        <button
          onClick={() =>
            void controller.save((current) => ({
              ...current,
              instructions: { ...current.instructions, codex: "codex --search" },
            }))
          }
        >
          Save command
        </button>
        <button
          onClick={() =>
            void controller.save((current) => ({
              ...current,
              default_agent: "hermes",
            }))
          }
        >
          Save default
        </button>
      </>
    );
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Entry />));
    const buttons = host.querySelectorAll("button");
    await act(async () => buttons[0].click());
    await act(async () => buttons[1].click());
    expect(calls).toBe(1);
    await act(async () => releaseFirst());
    await vi.waitFor(() => expect(calls).toBe(2));
    const last = vi.mocked(saveAgentLaunchSettings).mock.calls.at(-1)![0];
    expect(last.default_agent).toBe("hermes");
    expect(last.instructions.codex).toBe("codex --search");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
