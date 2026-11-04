// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import { makeProject } from "../../tests/fixtures/workspace";
import { refreshProjectWorktrees } from "../hooks/useProjectWorktrees";
import { WorktreeCheckoutSwitcher } from "./worktree/WorktreeCheckoutSwitcher";
import { WindowTitleBar } from "./WindowTitleBar";
import { openDirectoryInVscode } from "../lib/openInVscode";
import { CommandPalette } from "./CommandPalette";
import { SidebarVisibilityContext } from "../hooks/sidebarVisibility";
import { ProjectSwitcher } from "./worktree/ProjectSwitcher";
import { WorkspaceFilesProvider } from "./worktree/WorkspaceFilesContext";
import { getProjectGitReferences, runProjectGitAction } from "../lib/gitApi";
import { createProjectWorktree, getProjectWorktrees } from "../lib/worktreeApi";

vi.mock("../lib/gitApi", () => ({
  getProjectGitReferences: vi.fn(),
  runProjectGitAction: vi.fn(),
}));
vi.mock("../lib/worktreeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/worktreeApi")>();
  return {
    ...actual,
    createProjectWorktree: vi.fn(),
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
const translate = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value() {
        this.open = false;
      },
    },
  });
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
      <aside>
        <WorktreeCheckoutSwitcher />
      </aside>
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

it("lists projects in the title bar and switches from a child checkout to another project", async () => {
  await render("/project/demo?worktree=%3Cworkspace%3E%2Fdemo-topic");
  const selector = container.querySelector<HTMLButtonElement>(
    'header [role="combobox"][aria-label="切换项目"]',
  )!;
  expect(selector.textContent).toContain("Demo workspace");
  await act(async () => selector.click());
  const options = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
  ];
  expect(options.map((item) => item.textContent)).toEqual([
    "Demo workspace",
    "Other workspace",
  ]);
  await act(async () => options[1].click());
  expect(selector.textContent).toContain("Other workspace");
  expect(container.querySelector("output")?.textContent).toBe("/project/other");
  expect(
    container.querySelector<HTMLSelectElement>("aside select")!.value,
  ).toBe(JSON.stringify(["other", "~/projects/other"]));
});

it("places the VS Code icon beside the project selector and opens the route worktree", async () => {
  await render("/project/demo?worktree=%2Fworkspace%2Ftopic");
  const selector = container.querySelector(
    'header [role="combobox"][aria-label="切换项目"]',
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

it("separates project, directory and branch selection and preserves the checkout on branch failure", async () => {
  const remove = vi.fn();
  function SharedShell() {
    const location = useLocation();
    return (
      <>
        <WindowTitleBar onOpenCommands={() => {}} />
        <aside>
          <WorktreeCheckoutSwitcher />
        </aside>
        <ProjectSwitcher onRemove={remove} />
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
  const checkout = () =>
    container.querySelector<HTMLSelectElement>(
      'select[aria-label="切换工作树"]',
    )!;
  const branch = () =>
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="切换分支"]',
    )!;
  expect(checkout().selectedOptions[0].text).toBe("demo-topic");
  expect(branch().textContent).toContain("feature/shared");
  expect(container.querySelectorAll("header [role=combobox]")).toHaveLength(1);
  expect(
    container.querySelector("header [role=combobox]")?.textContent,
  ).toContain("Demo workspace");
  expect(
    [...container.querySelectorAll("header option")].some((option) =>
      option.textContent?.includes("Other workspace"),
    ),
  ).toBe(true);
  expect(checkout().options[0].text).toContain("主工作树");
  expect(
    container.querySelector('button[aria-label="移除项目 Demo workspace"]'),
  ).toBeNull();
  const directoryTrigger = container.querySelector<HTMLButtonElement>(
    'button[role="combobox"][aria-label="切换工作树"]',
  )!;
  const key = async (value: string) =>
    act(async () => {
      directoryTrigger.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: value,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  await key("Home");
  await key("Enter");
  expect(checkout().value).toBe(JSON.stringify(["demo", "<workspace>/demo"]));
  expect(branch().textContent).toContain("main");
  await key("End");
  await key("Escape");
  expect(checkout().value).toBe(JSON.stringify(["demo", "<workspace>/demo"]));
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(directoryTrigger);
  await key("End");
  await key("ArrowUp");
  await key("Enter");
  expect(checkout().value).toBe(
    JSON.stringify(["demo", "<workspace>/demo-topic"]),
  );
  expect(branch().textContent).toContain("feature/shared");
  expect(runProjectGitAction).not.toHaveBeenCalled();
  const route = container.querySelector("output")!.textContent;
  vi.mocked(getProjectGitReferences).mockResolvedValue({
    entries: [
      { kind: "branches", name: "main", sha: "abcdef" },
      { kind: "branches", name: "feature/shared", sha: "fedcba" },
    ],
    truncated: false,
  });
  vi.mocked(runProjectGitAction).mockRejectedValueOnce(
    new Error("Local changes would be overwritten"),
  );
  await act(async () => branch().click());
  const chooseBranch = () =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (button) => button.textContent === "main",
    )!;
  await act(async () => chooseBranch().click());
  expect(runProjectGitAction).toHaveBeenLastCalledWith(
    "demo",
    "<workspace>/demo-topic",
    "switch_branch",
    "main",
  );
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Local changes would be overwritten",
  );
  expect(container.querySelector("output")!.textContent).toBe(route);
  vi.mocked(runProjectGitAction).mockImplementationOnce(async () => {
    vi.mocked(getProjectWorktrees).mockResolvedValueOnce([
      {
        path: "<workspace>/demo-topic",
        branch: "main",
        head: "abcdef",
        is_main: false,
        locked: false,
        available: true,
      },
    ]);
    window.dispatchEvent(new Event("project-git-changed"));
  });
  await act(async () => branch().click());
  await act(async () => chooseBranch().click());
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(branch().textContent).toContain("main");
  expect(checkout().selectedOptions[0].text).toBe("demo-topic");
  expect(container.querySelector("output")!.textContent).toBe(route);
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
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[aria-label="项目操作"]')!
      .click(),
  );
  const removeAction = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ].find((button) => button.textContent === "移除项目 Demo workspace")!;
  expect(remove).not.toHaveBeenCalled();
  await act(async () => removeAction.click());
  expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: "demo" }));
});

it("preserves an unavailable worktree instead of silently selecting the main directory", async () => {
  await act(async () =>
    root.render(
      <MemoryRouter
        initialEntries={["/project/demo?worktree=%3Cworkspace%3E%2Fmissing"]}
      >
        <WorkspaceFilesProvider>
          <WindowTitleBar onOpenCommands={() => {}} />
          <aside>
            <WorktreeCheckoutSwitcher />
          </aside>
          <ProjectSwitcher onRemove={() => {}} />
        </WorkspaceFilesProvider>
      </MemoryRouter>,
    ),
  );
  const directory = container.querySelector<HTMLSelectElement>(
    'select[aria-label="切换工作树"]',
  )!;
  expect(directory.selectedOptions[0].text).toBe("missing");
  expect(directory.selectedOptions[0].disabled).toBe(true);
  expect(
    container.querySelector<HTMLButtonElement>('button[aria-label="切换分支"]')!
      .disabled,
  ).toBe(true);
  expect(
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="刷新工作树"]',
    )!.disabled,
  ).toBe(false);
});

it("creates a worktree from the explorer menu, retains failed inputs and switches only after success", async () => {
  await refreshProjectWorktrees("demo");
  await render("/project/demo");
  const trigger = container.querySelector<HTMLButtonElement>(
    'aside [role="combobox"]',
  )!;
  await act(async () => trigger.click());
  const create = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
  ].find((item) => item.textContent?.includes("创建工作树…"))!;
  await act(async () => create.click());
  const dialog = document.querySelector("dialog")!;
  const inputs = [...dialog.querySelectorAll("input")];
  expect(document.activeElement).toBe(inputs[0]);
  expect(trigger.textContent).toContain("demo");
  async function fill(input: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await fill(inputs[0], "feature/new");
  expect(inputs[1].value).toBe("<workspace>/demo-feature-new");
  await fill(inputs[1], "/workspace/new checkout");
  vi.mocked(createProjectWorktree).mockRejectedValueOnce(
    new Error("Branch already exists"),
  );
  const submit = () =>
    dialog
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await act(async () => {
    submit();
    submit();
  });
  expect(createProjectWorktree).toHaveBeenCalledTimes(1);
  expect(createProjectWorktree).toHaveBeenLastCalledWith(
    "demo",
    "<workspace>/demo",
    "feature/new",
    "/workspace/new checkout",
  );
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain(
    "Branch already exists",
  );
  expect(inputs[0].value).toBe("feature/new");
  expect(inputs[1].value).toBe("/workspace/new checkout");
  expect(trigger.textContent).toContain("demo");
  const created = {
    path: "/workspace/new checkout",
    branch: "feature/new",
    head: "abcdef",
    is_main: false,
    locked: false,
    available: true,
  };
  vi.mocked(createProjectWorktree).mockResolvedValueOnce(created);
  vi.mocked(getProjectWorktrees).mockResolvedValueOnce([created]);
  await act(async () => {
    submit();
  });
  expect(document.querySelector("dialog")).toBeNull();
  expect(trigger.textContent).toContain("new checkout");
  expect(document.activeElement).toBe(trigger);
});

it("cancels worktree creation without changing the current checkout", async () => {
  await refreshProjectWorktrees("demo");
  await render("/project/demo");
  const trigger = container.querySelector<HTMLButtonElement>(
    'aside [role="combobox"]',
  )!;
  await act(async () => trigger.click());
  const create = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
  ].find((item) => item.textContent?.includes("创建工作树…"))!;
  await act(async () => create.click());
  await act(async () =>
    document
      .querySelector("dialog")!
      .dispatchEvent(new Event("cancel", { cancelable: true })),
  );
  expect(document.querySelector("dialog")).toBeNull();
  expect(createProjectWorktree).not.toHaveBeenCalled();
  expect(trigger.textContent).toContain("demo");
  expect(document.activeElement).toBe(trigger);
});

it("places branch actions in the footer and opens the menu above the bottom trigger", async () => {
  function FooterShell() {
    const [branchContainer, setBranchContainer] =
      useState<HTMLDivElement | null>(null);
    return (
      <SidebarVisibilityContext.Provider
        value={{
          resourcePanelVisible: false,
          setResourcePanelVisible: () => {},
          branchContainer,
        }}
      >
        <aside>
          <ProjectSwitcher onRemove={() => {}} />
        </aside>
        <footer>
          <div ref={setBranchContainer} />
        </footer>
      </SidebarVisibilityContext.Provider>
    );
  }
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/project/demo"]}>
        <WorkspaceFilesProvider>
          <FooterShell />
        </WorkspaceFilesProvider>
      </MemoryRouter>,
    ),
  );
  expect(container.querySelector("aside button")).toBeNull();
  const branch = container.querySelector<HTMLButtonElement>(
    'footer button[aria-label="切换分支"]',
  )!;
  expect(branch.textContent).toContain("main");
  vi.spyOn(branch, "getBoundingClientRect").mockReturnValue({
    x: 8,
    y: 740,
    top: 740,
    bottom: 766,
    left: 8,
    right: 160,
    width: 152,
    height: 26,
    toJSON: () => ({}),
  });
  await act(async () => branch.click());
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  expect(menu).not.toBeNull();
  expect(Number.parseFloat(menu.style.top)).toBeLessThan(740);
  const option = [
    ...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ].find((item) => item.textContent === "feature/shared")!;
  await act(async () => option.click());
  expect(runProjectGitAction).toHaveBeenLastCalledWith(
    "demo",
    "<workspace>/demo",
    "switch_branch",
    "feature/shared",
  );
});
