// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TerminalPanelTools } from "./TerminalPanelTools";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
let host: HTMLDivElement;
let root: Root;
const launch = vi.fn();
const sidebar = vi.fn();
const upgrade = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(
  busy = false,
  hasTerminal = true,
  onProjectSkills?: () => void,
) {
  await act(async () =>
    root.render(
      <TerminalPanelTools
        hasTerminal={hasTerminal}
        herdrBusy={busy}
        updateVersion="1.2.3"
        onProjectSkills={onProjectSkills}
        canSplit

        onHerdr={launch}
        onHerdrSidebar={sidebar}
        onHerdrUpgrade={upgrade}
        onSplit={() => {}}
      />,
    ),
  );
}
const trigger = () =>
  host.querySelector<HTMLButtonElement>('[aria-label="Herdr"]')!;
const items = () => [
  ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
];

it("groups launch, sidebar and update in a single menu and closes after selecting", async () => {
  await render();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  for (const [index, callback] of [launch, sidebar, upgrade].entries()) {
    await act(async () => trigger().click());
    expect(items().map((item) => item.textContent)).toEqual([
      "terminal.herdrLaunch",
      "terminal.herdrSidebar",
      "terminal.herdrUpdateAvailable",
    ]);
    await act(async () => items()[index].click());
    expect(callback).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  }
});

it("supports keyboard navigation and Escape returns focus to the menu trigger", async () => {
  await render();
  await act(async () => {
    trigger().focus();
    trigger().dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  expect(document.activeElement).toBe(items()[0]);
  await act(async () =>
    items()[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(items()[2]);
  await act(async () =>
    items()[2].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

it("disables actions during preparation and disables the trigger without a terminal", async () => {
  await render(true);
  await act(async () => trigger().click());
  expect(items().every((item) => item.disabled)).toBe(true);
  await act(async () => items()[0].click());
  expect(launch).not.toHaveBeenCalled();
  await act(async () => trigger().click());
  await render(false, false);
  expect(trigger().disabled).toBe(true);
});

it("opens project skills from the right menu without requiring a terminal", async () => {
  const openSkills = vi.fn();
  await render(false, false, openSkills);
  expect(host.textContent).not.toContain("worktree.projectSkills");
  const more = host.querySelector<HTMLButtonElement>(
    '[aria-label="common.more"]',
  )!;
  expect(more.disabled).toBe(false);
  await act(async () => more.click());
  const skills = items().find(
    (item) => item.textContent === "worktree.projectSkills",
  )!;
  await act(async () => skills.click());
  expect(openSkills).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="menu"]')).toBeNull();
});
