// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { TerminalNewMenu } from "./TerminalNewMenu";
import { queuePreviewWeb } from "../../features/preview/shared/openRequests";
import { getAgentIconSrc } from "../../lib/agentIcons";
import { TerminalNewMenuContent } from "./TerminalNewMenuContent";
import { SidebarVisibilityContext } from "../../hooks/sidebarVisibility";
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
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (button) => button.textContent?.startsWith(label),
    )!;
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
          <SidebarVisibilityContext.Provider
            value={{
              resourcePanelVisible: true,
              setResourcePanelVisible: () => {},
              openSidebarPanel: vi.fn(),
            }}
          >
            <TerminalNewMenu
              disabled
              tools={[{ key: "codex", installed: true }]}
              onNew={onNew}
              onNewMarkdown={markdown}
              onHerdr={herdr}
            />
            <Location />
          </SidebarVisibilityContext.Provider>
        </MemoryRouter>,
      ),
    );
    await open();
    expect(document.activeElement?.tagName).toBe("INPUT");
    expect(item("terminal.new").disabled).toBe(true);
    expect(item("Codex").disabled).toBe(true);
    expect(item("terminal.openHerdr").disabled).toBe(true);
    expect(
      document.querySelector<HTMLButtonElement>('[aria-label="herdr.settings"]')
        ?.disabled,
    ).toBe(false);
    expect(item("Codex").textContent).toBe("Codex");
    await search("missing");
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(0);
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      "terminal.noNewMatches",
    );
    await search("Markdown");
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
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

it.each([
  ["codex", "codex"],
  ["claude_code", "claude_code"],
  ["claude_teams", "claude_code"],
  ["opencode", "codex"],
])(
  "shows the launch default %s icon and opens its settings without launching an Agent",
  async (key, icon) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    defaults.key = key;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const launch = vi.fn(),
      close = vi.fn();
    const openPanel = vi.fn();
    try {
      await act(async () =>
        root.render(
          <MemoryRouter>
            <SidebarVisibilityContext.Provider
              value={{
                resourcePanelVisible: true,
                setResourcePanelVisible: () => {},
                openSidebarPanel: openPanel,
              }}
            >
              <TerminalNewMenuContent
                tools={[
                  { key: "codex", installed: true },
                  { key: "claude_code", installed: true },
                ]}
                terminalDisabled={false}
                onNew={() => {}}
                onHerdr={launch}
                close={close}
              />
              <Location />
            </SidebarVisibilityContext.Provider>
          </MemoryRouter>,
        ),
      );
      const button = [
        ...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
      ].find((item) => item.textContent === "terminal.openHerdr")!;
      expect(button.querySelector("img")).toBeNull();
      expect(button.querySelector("svg")).not.toBeNull();
      expect(
        button.parentElement?.previousElementSibling?.getAttribute("role"),
      ).toBe("separator");
      const settings = host.querySelector<HTMLButtonElement>(
        '[aria-label="herdr.settings"]',
      )!;
      expect(
        settings.previousElementSibling
          ?.querySelector("img")
          ?.getAttribute("src"),
      ).toBe(getAgentIconSrc(icon));
      button.focus();
      await act(async () =>
        button.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
        ),
      );
      expect(document.activeElement).toBe(settings);
      await act(async () => settings.click());
      expect(openPanel).toHaveBeenCalledExactlyOnceWith("herdr", "settings");
      expect(host.querySelector("output")?.textContent).toBe("/");
      expect(launch).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      defaults.key = "codex";
      vi.unstubAllGlobals();
    }
  },
);
