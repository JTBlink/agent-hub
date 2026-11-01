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

it("launches Herdr directly without opening a menu", async () => {
  await render();
  await act(async () => trigger().click());
  expect(launch).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(trigger().hasAttribute("aria-haspopup")).toBe(false);
});

it("offers an available update as a separate button", async () => {
  await render();
  const update = host.querySelector<HTMLButtonElement>(
    '[aria-label="terminal.herdrUpdateAvailable"]',
  )!;
  await act(async () => update.click());
  expect(upgrade).toHaveBeenCalledOnce();
  expect(launch).not.toHaveBeenCalled();
});

it("prevents repeated launch while preparing and launch without a terminal", async () => {
  await render(true);
  await act(async () => trigger().click());
  expect(launch).not.toHaveBeenCalled();
  expect(trigger().getAttribute("aria-busy")).toBe("true");
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
