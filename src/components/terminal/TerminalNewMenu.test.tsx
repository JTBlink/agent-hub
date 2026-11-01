// @vitest-environment jsdom
import { act } from "react";
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
    [...document.querySelectorAll('[role="menuitem"]')].map(
      (item) => item.textContent,
    );
  const render = async (claudeInstalled: boolean, codexInstalled: boolean) => {
    await act(async () =>
      root.render(
        <TerminalNewMenu
          disabled={false}
          tools={[
            { key: "claude_code", installed: claudeInstalled },
            { key: "codex", installed: codexInstalled },
            { key: "opencode", installed: false },
            { key: "cursor", installed: true },
          ]}
          onNew={onNew}
        />,
      ),
    );
  };
  try {
    await render(false, false);
    await act(async () => host.querySelector("button")!.click());
    expect(labels()).toEqual(["terminal.new"]);
    await render(true, false);
    expect(labels()).toEqual([
      "terminal.new",
      "Claude Code",
      "Claude Agent Teams",
    ]);
    const teams = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === "Claude Agent Teams")!;
    await act(async () => teams.click());
    expect(onNew).toHaveBeenCalledWith("claude_teams");
    await render(false, true);
    await act(async () => host.querySelector("button")!.click());
    expect(labels()).toEqual(["terminal.new", "Codex"]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
