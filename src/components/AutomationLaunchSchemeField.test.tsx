// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AutomationLaunchSchemeField } from "./AutomationLaunchSchemeField";
import type { AgentLaunchSnapshot } from "../lib/agentLaunchConfig";
import type { AutomationDraft } from "../lib/tauri";
const shared = vi.hoisted((): { snapshot: AgentLaunchSnapshot | null } => ({
  snapshot: null,
}));
vi.mock("../hooks/useAgentLaunchSettings", () => ({
  useAgentLaunchSettings: () => ({
    snapshot: shared.snapshot,
    error: "",
    busy: false,
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("./settings/AgentLaunchEditor", () => ({
  AgentLaunchEditor: ({ agentKey }: { agentKey: string }) => (
    <output data-managed-agent>{agentKey}</output>
  ),
}));
vi.mock("./AppDialog", () => ({
  AppDialog: ({ children }: { children: ReactNode }) => (
    <section data-managed-dialog>{children}</section>
  ),
}));

it("saves only a scheme reference, reads edited commands dynamically and reports a deleted reference", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  shared.snapshot = {
    revision: "first",
    defaults: { codex: "codex" },
    document: {
      schema_version: 2,
      default_agent: "codex",
      schemes: {
        codex: {
          default_id: "default",
          items: [
            { id: "default", name: "Automatic", instruction: "codex" },
            { id: "custom", name: "Custom", instruction: "codex-yolo" },
          ],
        },
      },
    },
  };
  let draft: AutomationDraft = {
    name: "Review",
    provider: "system",
    content: "sh ./run.sh",
    workdir: null,
    enabled: false,
    schedule: { kind: "manual" },
    files: [
      {
        path: "config/agent.json",
        content: JSON.stringify({
          runner: { kind: "codex", session: "default", title: "Review" },
          launch: { arguments: [] },
          execution: { wait_timeout_seconds: 1800 },
        }),
      },
    ],
  };
  const validity = vi.fn();
  const change = vi.fn((patch: Partial<AutomationDraft>) => {
    draft = { ...draft, ...patch };
  });
  const render = () =>
    root.render(
      <AutomationLaunchSchemeField
        draft={draft}
        agentKey="codex"
        disabled={false}
        onChange={change}
        onValidityChange={validity}
      />,
    );
  try {
    await act(render);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="combobox"]')!.click(),
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
        .find((item) => item.textContent === "Custom")!
        .click(),
    );
    expect(JSON.parse(draft.files![0].content).launch).toEqual({
      arguments: [],
      scheme_id: "custom",
    });
    expect(draft.files![0].content).not.toContain("codex-yolo");
    await act(render);
    expect(host.textContent).toContain("codex-yolo");
    shared.snapshot = {
      ...shared.snapshot,
      revision: "edited",
      document: {
        ...shared.snapshot.document,
        schemes: {
          codex: {
            default_id: "default",
            items: [
              { id: "default", name: "Automatic", instruction: "codex" },
              { id: "custom", name: "Renamed", instruction: "custom-updated" },
            ],
          },
        },
      },
    };
    await act(render);
    expect(host.textContent).toContain("custom-updated");
    shared.snapshot.document.schemes!.codex.items.pop();
    await act(render);
    expect(validity).toHaveBeenLastCalledWith(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "agentLaunch.schemes.unavailable",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("keeps the opened manager bound to its Agent when the task's resolved Agent changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  shared.snapshot = {
    revision: "first",
    defaults: { codex: "codex", hermes: "hermes --yolo" },
    document: { schema_version: 2, default_agent: "codex", schemes: {} },
  };
  const draft: AutomationDraft = {
    name: "Review",
    provider: "system",
    content: "sh ./run.sh",
    workdir: null,
    enabled: false,
    schedule: { kind: "manual" },
    files: [
      {
        path: "config/agent.json",
        content: JSON.stringify({
          runner: { kind: "default", session: "default", title: "Review" },
          launch: { arguments: [] },
          execution: { wait_timeout_seconds: 1800 },
        }),
      },
    ],
  };
  const render = (agentKey: string) =>
    root.render(
      <AutomationLaunchSchemeField
        draft={draft}
        agentKey={agentKey}
        disabled={false}
        onChange={() => {}}
      />,
    );
  try {
    await act(async () => render("codex"));
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="combobox"]')!.click(),
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "agentLaunch.schemes.manage")!
        .click(),
    );
    expect(host.querySelector("[data-managed-agent]")?.textContent).toBe(
      "codex",
    );
    await act(async () => render("hermes"));
    expect(host.querySelector("[data-managed-agent]")?.textContent).toBe(
      "codex",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
