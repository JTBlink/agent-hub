// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import { makeProject } from "../../tests/fixtures/workspace";
import { WindowTitleBar } from "./WindowTitleBar";
import { CommandPalette } from "./CommandPalette";

const drag = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useDragWindow", () => ({ useDragWindow: () => drag }));
vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    projects: [{ ...makeProject(), id: "demo", name: "Demo workspace" }],
    managedSkills: [],
    skillGroups: [],
    viewedSkillGroup: null,
    setViewedSkillGroupId: vi.fn(),
    openSkillDetailById: vi.fn(),
  }),
}));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function Shell() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <WindowTitleBar onOpenCommands={() => setOpen(true)} />
      <CommandPalette open={open} onOpenChange={setOpen} />
      <output>{useLocation().pathname}</output>
    </>
  );
}
async function render(path = "/tasks") {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Shell />
      </MemoryRouter>,
    ),
  );
}
function search() {
  return container.querySelector<HTMLButtonElement>(
    '[aria-label="搜索与命令"]',
  )!;
}
async function settleFocus() {
  await act(
    async () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

it.each([
  ["/tasks", "任务"],
  ["/project/demo", "Demo workspace"],
  ["/project/demo/skills", "Demo workspace"],
  ["/global-workspace/codex", "全局工作区"],
  ["/help/example", "帮助中心"],
])("shows current context for %s", async (path, title) => {
  await render(path);
  expect(search().textContent).toContain(title);
  expect(search().title).toContain(i18n.t("commandPalette.placeholder"));
});

it("opens commands from the title bar, focuses search and restores focus on Escape", async () => {
  await render();
  search().focus();
  await act(async () => search().click());
  await settleFocus();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.activeElement).toBe(container.querySelector("input"));
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.activeElement).toBe(container.querySelector("input"));
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(search());
});

it("keeps the keyboard shortcut and command selection working", async () => {
  await render();
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
    ),
  );
  await settleFocus();
  const project = [
    ...container.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((item) => item.textContent?.includes("Demo workspace"))!;
  await act(async () => project.click());
  expect(container.querySelector("output")?.textContent).toBe("/project/demo");
  expect(search().textContent).toContain("Demo workspace");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it("drags from the title bar background while its controls remain clickable", async () => {
  await render();
  const header = container.querySelector("header")!;
  const mouseDown = () =>
    new MouseEvent("mousedown", { bubbles: true, buttons: 1, detail: 1 });
  await act(async () => header.dispatchEvent(mouseDown()));
  expect(drag).toHaveBeenCalledOnce();
  drag.mockClear();
  const help = container.querySelector<HTMLAnchorElement>('a[href="/help"]')!;
  await act(async () => {
    search().dispatchEvent(mouseDown());
    help.dispatchEvent(mouseDown());
  });
  expect(drag).not.toHaveBeenCalled();
  await act(async () => help.click());
  expect(container.querySelector("output")?.textContent).toBe("/help");
});
