// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CardActionMenu } from "../../../src/components/CardActionMenu";
import { NewMenu } from "./TerminalNewMenuPrototype";
import { useLaunchSettingsPrototype } from "./useLaunchSettingsPrototype";

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
    const settings = useLaunchSettingsPrototype();
    const value = {
      ...settings,
      groups: {
        ...settings.groups,
        codex: {
          ...settings.groups.codex,
          groups: [
            ...settings.groups.codex.groups,
            { id: "custom", name: "用户自建", command: "codex-yolo" },
          ],
        },
      },
    };
    return (
      <CardActionMenu
        label="新建标签"
        actions={[]}
        renderContent={(close) => (
          <NewMenu
            settings={value}
            close={close}
            onLaunch={launch}
            onBasic={() => {}}
            onSettings={() => {}}
            onHerdrSettings={() => {}}
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
      labelled("通过 Herdr 启动 Codex").dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });
    expect(document.querySelector('[aria-label="启动方案"]')).not.toBeNull();
    const submenu = document.querySelector('[aria-label="启动方案"]')!;
    expect(submenu.parentElement?.textContent).toBe(submenu.textContent);
    expect(submenu.parentElement?.textContent).not.toContain(
      "通过 Herdr 启动 · Codex",
    );
    await act(async () => {
      labelled("在内嵌终端启动 Codex").dispatchEvent(
        new MouseEvent("mouseover", {
          bubbles: true,
          relatedTarget: labelled("通过 Herdr 启动 Codex"),
        }),
      );
    });
    expect(document.querySelector('[aria-label="启动方案"]')).not.toBeNull();
    await act(async () => {
      custom().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(labelled("通过 Herdr 启动 Codex")).not.toBeNull();
    expect(document.querySelector('[aria-label="启动方案"]')).toBeNull();
    await mouse(labelled("通过 Herdr 启动 Codex"));
    await mouse(custom());
    expect(launch).toHaveBeenCalledExactlyOnceWith(
      { agentKey: "codex", groupId: "custom" },
      "terminal",
      "Codex",
    );
    expect(document.querySelector('[aria-label="启动方案"]')).toBeNull();
    await mouse(labelled("新建标签"));
    await act(async () => {
      labelled("在内嵌终端启动 Codex").dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });
    const schemeHerdr = labelled("通过 Herdr 启动 Codex · 用户自建");
    expect(schemeHerdr).not.toBeNull();
    await mouse(schemeHerdr);
    expect(launch).toHaveBeenLastCalledWith(
      { agentKey: "codex", groupId: "custom" },
      "herdr",
      "Codex",
    );
    await mouse(labelled("新建标签"));
    await act(async () => {
      labelled("在内嵌终端启动 Codex").dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });
    await mouse(custom());
    expect(launch).toHaveBeenLastCalledWith(
      { agentKey: "codex", groupId: "custom" },
      "terminal",
      "Codex",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
