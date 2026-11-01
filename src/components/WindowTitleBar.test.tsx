// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import { makeProject } from "../../tests/fixtures/workspace";
import { WindowTitleBar } from "./WindowTitleBar";
import { openDirectoryInVscode } from "../lib/openInVscode";
import { CommandPalette } from "./CommandPalette";
import { ProjectSwitcher } from "./worktree/ProjectSwitcher";
import { WorkspaceFilesProvider } from "./worktree/WorkspaceFilesContext";
import { getProjectWorktrees } from "../lib/worktreeApi";

vi.mock("../lib/worktreeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/worktreeApi")>();
  return {
    ...actual,
    getProjectWorktrees: vi.fn(async (id: string) => {
      const path = id === "other" ? "~/projects/other" : "<workspace>/demo";
      return [
        {
          path,
          branch: "main",
          head: "abcdef",
          is_main: true,
          locked: false,
          available: true,
        },
        {
          path: `${path}-topic`,
          branch: "feature/shared",
          head: "fedcba",
          is_main: false,
          locked: false,
          available: true,
        },
      ];
    }),
  };
});

vi.mock("../i18n", () => ({ default: { t: (key: string) => key } }));

vi.mock("../lib/openInVscode", () => ({
  openDirectoryInVscode: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/tauri", () => ({
  touchProjectVisited: vi.fn().mockResolvedValue(undefined),
  getSettings: vi.fn().mockResolvedValue(null),
  setSettings: vi.fn().mockResolvedValue(undefined),
}));
const drag = vi.hoisted(() => vi.fn());
vi.mock("../hooks/useDragWindow", () => ({ useDragWindow: () => drag }));
vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    projects: [
      { ...makeProject(), id: "demo", name: "Demo workspace" },
      {
        ...makeProject(),
        id: "other",
        name: "Other workspace",
        path: "~/projects/other",
      },
    ],
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
  ["/global-workspace/codex", "Agent 工作区"],
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

it("switches projects from the title bar without dragging the window", async () => {
  await render();
  const selector = container.querySelector<HTMLButtonElement>(
    '[role="combobox"][aria-label="切换项目"]',
  )!;
  await act(async () =>
    selector.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
  );
  expect(drag).not.toHaveBeenCalled();
  await act(async () => selector.click());
  const option = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
  ].find((item) => item.textContent === "Other workspace")!;
  await act(async () => option.click());
  expect(container.querySelector("output")?.textContent).toBe("/project/other");
  expect(selector.textContent).toContain("Other workspace");
});

it("places the VS Code icon beside the project selector and opens the route worktree", async () => {
  await render("/project/demo?worktree=%2Fworkspace%2Ftopic");
  const selector = container.querySelector(
    '[role="combobox"][aria-label="切换项目"]',
  )!;
  const button = container.querySelector<HTMLButtonElement>(
    'header button[aria-label="在 VS Code 中打开"]',
  )!;
  expect(button).not.toBeNull();
  expect(button.parentElement?.contains(selector)).toBe(true);
  expect(button.querySelector(".codicon-vscode")).not.toBeNull();
  const event = new MouseEvent("mousedown", { bubbles: true });
  await act(async () => {
    button.dispatchEvent(event);
    button.click();
  });
  expect(drag).not.toHaveBeenCalled();
  expect(openDirectoryInVscode).toHaveBeenLastCalledWith("/workspace/topic");
});

it("shares checkout options, selection and branch refresh between the title bar and sidebar", async () => {
  function SharedShell() {
    const location = useLocation();
    const navigate = useNavigate();
    return (
      <>
        <WindowTitleBar onOpenCommands={() => {}} />
        <ProjectSwitcher onRemove={() => {}} />
        <button data-open-git onClick={() => navigate("/git")}>
          Git
        </button>
        <output>
          {location.pathname}
          {location.search}
        </output>
      </>
    );
  }
  await act(async () =>
    root.render(
      <MemoryRouter
        initialEntries={["/project/demo?worktree=%3Cworkspace%3E%2Fdemo-topic"]}
      >
        <WorkspaceFilesProvider>
          <SharedShell />
        </WorkspaceFilesProvider>
      </MemoryRouter>,
    ),
  );
  const selectors = () => [
    ...container.querySelectorAll<HTMLSelectElement>("select"),
  ];
  const assertShared = (path: string) => {
    const [header, sidebar] = selectors();
    expect(header.value).toBe(
      JSON.stringify([path.includes("other") ? "other" : "demo", path]),
    );
    expect(sidebar.value).toBe(header.value);
    expect(
      [...sidebar.options]
        .filter((option) => option.value)
        .map((option) => [option.value, option.text, option.disabled]),
    ).toEqual(
      [...header.options].map((option) => [
        option.value,
        option.text,
        option.disabled,
      ]),
    );
  };
  const choose = async (index: number, id: string, path: string) => {
    await act(async () => {
      const select = selectors()[index];
      select.value = JSON.stringify([id, path]);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  assertShared("<workspace>/demo-topic");
  await choose(1, "other", "~/projects/other");
  assertShared("~/projects/other");
  await choose(0, "demo", "<workspace>/demo");
  assertShared("<workspace>/demo");
  await choose(0, "demo", "<workspace>/demo-topic");
  assertShared("<workspace>/demo-topic");
  await act(async () =>
    container.querySelector<HTMLButtonElement>("[data-open-git]")!.click(),
  );
  assertShared("<workspace>/demo-topic");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        'header button[aria-label="在 VS Code 中打开"]',
      )!
      .click(),
  );
  expect(openDirectoryInVscode).toHaveBeenLastCalledWith(
    "<workspace>/demo-topic",
  );
  const calls = vi.mocked(getProjectWorktrees).mock.calls.length;
  vi.mocked(getProjectWorktrees).mockResolvedValueOnce([
    {
      path: "<workspace>/demo",
      branch: "main",
      head: "abcdef",
      is_main: true,
      locked: false,
      available: true,
    },
    {
      path: "<workspace>/demo-topic",
      branch: "feature/workspace-navigation-and-editor-improvements",
      head: "fedcba",
      is_main: false,
      locked: false,
      available: true,
    },
  ]);
  await act(async () => window.dispatchEvent(new Event("project-git-changed")));
  expect(getProjectWorktrees).toHaveBeenCalledTimes(calls + 1);
  assertShared("<workspace>/demo-topic");
  expect(selectors()[0].selectedOptions[0].text).toBe(
    "Demo workspace · feature/workspace-navigation-and-editor-improvements",
  );
  for (const trigger of container.querySelectorAll<HTMLButtonElement>(
    '[role="combobox"]',
  )) {
    expect(trigger.title).toContain(
      "feature/workspace-navigation-and-editor-improvements",
    );
    expect(trigger.title).toContain("<workspace>/demo-topic");
    expect(trigger.textContent).toContain(
      "feature/workspace-navigation-and-editor-improvements",
    );
  }
});
