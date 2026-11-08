// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HerdrAgentSettings } from "./HerdrAgentSettings";
import {
  getAgentLaunchSettings,
  saveAgentLaunchSettings,
  setToolEnabled,
  setCustomToolPath,
} from "../../../lib/tauri";
import type { AgentLaunchSnapshot } from "../../../lib/agentLaunchConfig";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../../context/AppContext", () => ({
  useApp: () => ({
    tools: [
      { key: "codex", display_name: "Codex" },
      { key: "hermes", display_name: "Hermes Agent" },
    ].map((tool) => ({
      ...tool,
      installed: true,
      enabled: true,
      skills_dir: `~/agents/${tool.key}/skills`,
      project_relative_skills_dir: ".agents/skills",
    })),
    refreshTools: vi.fn(),
  }),
}));
vi.mock("../../../lib/tauri", () => ({
  getAgentLaunchSettings: vi.fn(),
  saveAgentLaunchSettings: vi.fn(),
  setToolEnabled: vi.fn(),
  setCustomToolPath: vi.fn(),
}));
it("shares default and command settings, preserving the saved default and edited command when saving fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let snapshot: AgentLaunchSnapshot = {
    revision: "one",
    defaults: { codex: "codex", hermes: "hermes --yolo" },
    document: { schema_version: 1, default_agent: "codex", instructions: {} },
  };
  vi.mocked(getAgentLaunchSettings).mockResolvedValue(snapshot);
  vi.mocked(saveAgentLaunchSettings).mockImplementation(async (document) => {
    snapshot = { ...snapshot, document, revision: "two" };
    return snapshot;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const choose = async (label: string, value: string) => {
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
        .click(),
    );
    for (const icon of document.querySelectorAll<HTMLImageElement>(
      '[role="option"] img',
    ))
      expect(icon.src).toMatch(/^data:image\//);
    await act(async () => {
      const item = [
        ...document.querySelectorAll<HTMLElement>('[role="option"]'),
      ].find((item) => item.textContent === value)!;
      item.click();
    });
  };
  try {
    await act(async () => root.render(<HerdrAgentSettings />));
    expect(host.querySelectorAll('[aria-haspopup="listbox"]')).toHaveLength(1);
    expect(host.textContent).not.toContain("herdr.configureAgent");
    expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("codex");
    expect(host.querySelector("h3")?.textContent).toBe("herdr.agentLaunch");
    expect(host.querySelector("fieldset h3")?.textContent).toBe("Codex");
    expect(
      host.querySelector('[role="switch"]')?.getAttribute("aria-checked"),
    ).toBe("true");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="switch"]')!.click(),
    );
    expect(setToolEnabled).toHaveBeenCalledWith("codex", false);
    expect(host.querySelector("summary")?.textContent).toBe(
      "agentLaunch.details",
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[title="settings.editPath"]')!
        .click(),
    );
    const pathInput = host.querySelector<HTMLInputElement>(
      'input[aria-label="settings.skillsPath"]',
    )!;
    expect(pathInput.value).toBe("~/agents/codex/skills");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(pathInput, "~/shared/skills");
      pathInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="common.save"]')!
        .click(),
    );
    expect(setCustomToolPath).toHaveBeenCalledWith("codex", "~/shared/skills");
    await choose("herdr.defaultAgent", "Hermes Agent");
    expect(snapshot.document.default_agent).toBe("hermes");
    expect(host.querySelector("fieldset h3")?.textContent).toBe("Hermes Agent");
    expect(host.querySelector<HTMLInputElement>("input")?.value).toBe(
      "hermes --yolo",
    );
    vi.mocked(saveAgentLaunchSettings).mockRejectedValueOnce(
      new Error("Conflict"),
    );
    await choose("herdr.defaultAgent", "Codex");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Conflict",
    );
    expect(snapshot.document.default_agent).toBe("hermes");
    const input = host.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "hermes --yolo --continue");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "common.save")!
        .click(),
    );
    expect(snapshot.document.instructions.hermes).toBe(
      "hermes --yolo --continue",
    );
    expect(snapshot.document.default_agent).toBe("hermes");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("reloads the shared startup command when the settings surface is remounted", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const snapshot: AgentLaunchSnapshot = {
    revision: "one",
    defaults: {
      codex: "codex --dangerously-bypass-approvals-and-sandbox -c check_for_update_on_startup=false",
    },
    document: { schema_version: 1, default_agent: "codex", instructions: {} },
  };
  vi.mocked(getAgentLaunchSettings).mockResolvedValue(snapshot);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HerdrAgentSettings key="route-one" />));
    const input = host.querySelector<HTMLInputElement>(
      'input[aria-label="agentLaunch.instruction"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "codex --search");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.value).toBe("codex --search");

    const refreshed: AgentLaunchSnapshot = {
      ...snapshot,
      revision: "two",
      document: {
        ...snapshot.document,
        instructions: {
          codex:
            "codex --dangerously-bypass-approvals-and-sandbox -c check_for_update_on_startup=false --search",
        },
      },
    };
    vi.mocked(getAgentLaunchSettings).mockResolvedValue(refreshed);
    await act(async () => root.render(null));
    await act(async () => root.render(<HerdrAgentSettings />));
    expect(
      host.querySelector<HTMLInputElement>(
        'input[aria-label="agentLaunch.instruction"]',
      )?.value,
    ).toBe(refreshed.document.instructions.codex);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
