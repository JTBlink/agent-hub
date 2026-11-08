// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HerdrAgentSettings } from "./HerdrAgentSettings";
import {
  getAgentLaunchSettings,
  saveAgentLaunchSettings,
} from "../../../lib/tauri";
import type { AgentLaunchSnapshot } from "../../../lib/agentLaunchConfig";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../../context/AppContext", () => ({
  useApp: () => ({
    tools: [
      { key: "codex", installed: true },
      { key: "hermes", installed: true },
    ],
  }),
}));
vi.mock("../../../lib/tauri", () => ({
  getAgentLaunchSettings: vi.fn(),
  saveAgentLaunchSettings: vi.fn(),
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
    await choose("herdr.defaultAgent", "Hermes Agent");
    expect(snapshot.document.default_agent).toBe("hermes");
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
