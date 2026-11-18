// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CardActionMenu } from "../CardActionMenu";
import { TerminalAgentLaunchRows } from "./TerminalAgentLaunchRows";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("keeps Herdr schemes selectable through mouse down and returns one level on Escape", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const launch = vi.fn();
  function Fixture() {
    return (
      <CardActionMenu
        label="新建标签"
        actions={[]}
        renderContent={(close) => (
          <TerminalAgentLaunchRows
            rows={[
              {
                id: "codex",
                label: "Codex",
                toolKey: "codex",
                schemes: {
                  default_id: "default",
                  items: [
                    { id: "default", name: "Automatic", instruction: "codex" },
                    {
                      id: "custom",
                      name: "用户自建",
                      instruction: "codex-yolo",
                    },
                  ],
                },
              },
            ]}
            disabled={false}
            close={close}
            onNew={(agent, id) => launch(agent, id, "terminal")}
            onHerdr={(agent, id) => launch(agent, id, "herdr")}
          />
        )}
      />
    );
  }
  // Separate the phases: an outside-click listener can unmount a popup on mousedown.
  const mouse = async (button: HTMLButtonElement) => {
    await act(async () => {
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await act(async () => {
      button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      button.click();
    });
  };
  const labelled = (label: string) =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const custom = () =>
    [
      ...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    ].find((item) => item.textContent?.includes("用户自建"))!;
  try {
    await act(async () => root.render(<Fixture />));
    await mouse(labelled("新建标签"));
    await act(async () => {
      labelled("terminal.openHerdr Codex").dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });
    expect(
      document.querySelector('[aria-label="terminal.launchSchemes"]'),
    ).not.toBeNull();
    const submenu = document.querySelector(
      '[aria-label="terminal.launchSchemes"]',
    )!;
    expect(submenu.parentElement?.textContent).toBe(submenu.textContent);
    await act(async () => {
      labelled("terminal.new Codex").dispatchEvent(
        new MouseEvent("mouseover", {
          bubbles: true,
          relatedTarget: labelled("terminal.openHerdr Codex"),
        }),
      );
    });
    expect(
      document.querySelector('[aria-label="terminal.launchSchemes"]'),
    ).not.toBeNull();
    await act(async () => {
      custom().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(labelled("terminal.openHerdr Codex")).not.toBeNull();
    expect(
      document.querySelector('[aria-label="terminal.launchSchemes"]'),
    ).toBeNull();
    await mouse(labelled("terminal.openHerdr Codex"));
    await mouse(custom());
    expect(launch).toHaveBeenCalledExactlyOnceWith("codex", "custom", "herdr");
    expect(
      document.querySelector('[aria-label="terminal.launchSchemes"]'),
    ).toBeNull();
    await mouse(labelled("新建标签"));
    await act(async () => {
      labelled("terminal.new Codex").dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });
    const schemeHerdr = labelled("terminal.openHerdr Codex · 用户自建");
    expect(schemeHerdr).not.toBeNull();
    await mouse(schemeHerdr);
    expect(launch).toHaveBeenLastCalledWith("codex", "custom", "herdr");
    await mouse(labelled("新建标签"));
    await act(async () => {
      labelled("terminal.new Codex").dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });
    await mouse(custom());
    expect(launch).toHaveBeenLastCalledWith("codex", "custom", "terminal");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
