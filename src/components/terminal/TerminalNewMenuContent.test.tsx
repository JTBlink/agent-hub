// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { TerminalNewMenu } from "./TerminalNewMenu";
import { queuePreviewWeb } from "../../features/preview/shared/openRequests";
import { TerminalNewMenuContent } from "./TerminalNewMenuContent";
const defaults = vi.hoisted(() => ({ key: "codex" }));
vi.mock("../../hooks/useDefaultAgentKey", () => ({
  useDefaultAgentKey: () => defaults.key,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../features/preview/shared/openRequests", () => ({
  queuePreviewWeb: vi.fn(),
}));
function Location() {
  return <output>{useLocation().pathname + useLocation().hash}</output>;
}
it("searches actions, opens Markdown/mobile/settings and keeps browsing available when terminal capacity is full", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const herdr = vi.fn();
  const onNew = vi.fn(),
    markdown = vi.fn();
  const open = async () =>
    act(async () => host.querySelector("button")!.click());
  const item = (label: string) =>
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"], [role="menuitemradio"]',
      ),
    ].find((button) => button.textContent?.startsWith(label))!;
  const search = async (value: string) =>
    act(async () => {
      const input = document.querySelector("input")!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TerminalNewMenu
            disabled
            tools={[{ key: "codex", installed: true }]}
            onNew={onNew}
            onNewMarkdown={markdown}
            onHerdr={herdr}
          />
          <Location />
        </MemoryRouter>,
      ),
    );
    await open();
    expect(document.activeElement?.tagName).toBe("INPUT");
    expect(item("terminal.new").disabled).toBe(true);
    expect(item("Codex").disabled).toBe(true);
    const herdrCodex = document.querySelector<HTMLButtonElement>(
      '[aria-label="terminal.openHerdr Codex"]',
    );
    expect(herdrCodex?.disabled).toBe(true);
    expect(item("Codex").textContent).toContain("Codex");
    await search("missing");
    expect(
      document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]'),
    ).toHaveLength(0);
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      "terminal.noNewMatches",
    );
    await search("Markdown");
    expect(
      document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]'),
    ).toHaveLength(1);
    await act(async () => item("terminal.newMarkdown").click());
    expect(markdown).toHaveBeenCalledOnce();
    await open();
    await act(async () => item("terminal.newMobile").click());
    expect(queuePreviewWeb).toHaveBeenCalledWith("about:blank", "default", {
      width: 390,
      height: 844,
      mobile: true,
    });
    await open();
    await search("Browser");
    await act(async () =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(queuePreviewWeb).toHaveBeenCalledWith("about:blank");
    await open();
    await act(async () =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector("button"));
    await open();
    await act(async () => item("terminal.agentSettings").click());
    expect(host.querySelector("output")?.textContent).toBe("/settings#agents");
    expect(onNew).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("launches a selected Agent in the current terminal or through Herdr", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onNew = vi.fn();
  const onHerdr = vi.fn();
  const close = vi.fn();
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <TerminalNewMenuContent
            tools={[
              { key: "codex", installed: true },
              { key: "claude_code", installed: true },
            ]}
            terminalDisabled={false}
            onNew={onNew}
            onHerdr={onHerdr}
            close={close}
          />
        </MemoryRouter>,
      ),
    );
    const codex = [
      ...host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    ].find((button) => button.textContent?.includes("Codex"))!;
    expect(codex.getAttribute("aria-checked")).toBe("true");
    await act(async () => codex.click());
    expect(onNew).toHaveBeenCalledWith("codex");

    await act(async () =>
      root.render(
        <MemoryRouter>
          <TerminalNewMenuContent
            tools={[
              { key: "codex", installed: true },
              { key: "claude_code", installed: true },
            ]}
            terminalDisabled={false}
            onNew={onNew}
            onHerdr={onHerdr}
            close={close}
          />
        </MemoryRouter>,
      ),
    );
    const herdr = host.querySelector<HTMLButtonElement>(
      '[aria-label="terminal.openHerdr Claude Code"]',
    )!;
    await act(async () => herdr.click());
    expect(onHerdr).toHaveBeenCalledWith("claude");
    expect(close).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
