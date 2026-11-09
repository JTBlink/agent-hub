// @vitest-environment jsdom
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TerminalNewMenu } from "./TerminalNewMenu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("tracks settings installation changes and shares Claude installation with Teams", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onNew = vi.fn();
  const labels = () =>
    [
      ...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]'),
    ].map((item) => item.textContent);
  const render = async (claudeInstalled: boolean, codexInstalled: boolean) => {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TerminalNewMenu
            disabled={false}
            tools={[
              { key: "claude_code", installed: claudeInstalled },
              { key: "codex", installed: codexInstalled },
              { key: "opencode", installed: codexInstalled },
              { key: "hermes", installed: codexInstalled },
              { key: "cursor", installed: true },
            ]}
            onNew={onNew}
          />
        </MemoryRouter>,
      ),
    );
  };
  try {
    await render(false, false);
    await act(async () => host.querySelector("button")!.click());
    expect(labels()).toEqual([
      "terminal.new",
      "terminal.newBrowser",
      "terminal.newMobile",
      "terminal.agentSettings",
    ]);
    await render(true, false);
    expect(labels()).toEqual([
      "terminal.new",
      "terminal.newBrowser",
      "terminal.newMobile",
      "Claude Code",
      "Claude Agent Teams",
      "terminal.agentSettings",
    ]);
    for (const image of document.querySelectorAll<HTMLImageElement>(
      '[role="menuitem"] img, [role="menuitemradio"] img',
    )) {
      expect(image.src).toMatch(/^data:image\//);
    }
    const teams = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"], [role="menuitemradio"]',
      ),
    ].find((item) => item.textContent === "Claude Agent Teams")!;
    await act(async () => teams.click());
    expect(onNew).toHaveBeenCalledWith("claude_teams");
    await render(false, true);
    await act(async () => host.querySelector("button")!.click());
    expect(labels()).toEqual([
      "terminal.new",
      "terminal.newBrowser",
      "terminal.newMobile",
      "Codex",
      "OpenCode",
      "Hermes Agent",
      "terminal.agentSettings",
    ]);
    expect(
      document.querySelectorAll(
        '[role="menuitem"] img, [role="menuitemradio"] img',
      ),
    ).toHaveLength(3);
    for (const image of document.querySelectorAll<HTMLImageElement>(
      '[role="menuitem"] img, [role="menuitemradio"] img',
    )) {
      expect(image.src).toMatch(/^data:image\//);
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
