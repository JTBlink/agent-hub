// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HerdrWorkspaceList } from "./HerdrWorkspaceList";
import { groupHerdrWorkspaces } from "../lib/herdrWorkspaces";
import { makeProject } from "../../../../tests/fixtures/workspace";
import * as worktreeApi from "../../../lib/worktreeApi";
import type { HerdrWorkspace } from "../lib/herdrControlApi";
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
const spaces: HerdrWorkspace[] = [
  {
    workspace_id: "child",
    label: "feature",
    branch: "feature",
    directory: "/projects/feature",
    active_tab_id: "t2",
    worktree: {
      repo_key: "repo",
      checkout_path: "/projects/feature",
      is_linked_worktree: true,
    },
  },
  {
    workspace_id: "main",
    label: "demo",
    branch: "main",
    directory: "/projects/demo",
    active_tab_id: "t1",
    worktree: {
      repo_key: "repo",
      checkout_path: "/projects/demo",
      is_linked_worktree: false,
    },
  },
];
it("keeps unmatched worktrees visible and groups linked checkouts by repository identity", () => {
  expect(groupHerdrWorkspaces(spaces).roots.map((s) => s.workspace_id)).toEqual(
    ["main"],
  );
  expect(
    groupHerdrWorkspaces(spaces).children.get("main")?.[0].workspace_id,
  ).toBe("child");
  expect(groupHerdrWorkspaces([spaces[0]]).roots).toEqual([spaces[0]]);
});
it("opens child workspaces and collapses and expands their group", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const onOpen = vi.fn();
  try {
    await act(async () =>
      root.render(
        <HerdrWorkspaceList
          spaces={spaces}
          agents={[]}
          disabled={false}
          onOpen={onOpen}
        />,
      ),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[data-herdr-workspace="child"]')!
        .click(),
    );
    expect(onOpen).toHaveBeenCalledWith("child");
    const main = host.querySelector<HTMLButtonElement>(
      '[data-herdr-workspace="main"]',
    )!;
    await act(async () =>
      main.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      ),
    );
    const rootItems = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ];
    expect(rootItems.map((item) => item.textContent)).toEqual([
      "herdr.openProject",
    ]);
    await act(async () => rootItems[0].click());
    expect(onOpen).toHaveBeenLastCalledWith("main");
    expect(document.querySelector('[role="menu"]')).toBeNull();

    await act(async () =>
      host.querySelector<HTMLButtonElement>("[aria-expanded]")!.click(),
    );
    expect(host.querySelector('[data-herdr-workspace="child"]')).toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[aria-expanded]")!.click(),
    );
    expect(host.querySelector('[data-herdr-workspace="child"]')).toBeTruthy();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("automatically lists unopened worktrees, avoids duplicates and opens the selected checkout", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const load = vi.spyOn(worktreeApi, "getProjectWorktrees").mockResolvedValue([
    {
      path: "/projects/demo",
      branch: "main",
      head: null,
      is_main: true,
      available: true,
      locked: false,
    },
    {
      path: "/projects/feature",
      branch: "feature",
      head: null,
      is_main: false,
      available: true,
      locked: true,
    },
    {
      path: "/projects/new",
      branch: "new",
      head: null,
      is_main: false,
      available: true,
      locked: false,
    },
    {
      path: "/projects/missing",
      branch: "missing",
      head: null,
      is_main: false,
      available: false,
      locked: false,
    },
  ]);
  const host = document.createElement("div");
  const root = createRoot(host);
  const onOpenWorktree = vi.fn();
  const onOpen = vi.fn();
  try {
    await act(async () =>
      root.render(
        <HerdrWorkspaceList
          spaces={spaces}
          agents={[]}
          disabled={false}
          onOpen={onOpen}
          projects={[
            { ...makeProject(), id: "discover", path: "/projects/demo" },
          ]}
          onOpenWorktree={onOpenWorktree}
        />,
      ),
    );
    expect(load).toHaveBeenCalledWith("discover");
    expect(
      host.querySelectorAll('[data-herdr-workspace="child"]'),
    ).toHaveLength(1);
    expect(
      host.querySelector('[data-herdr-workspace="worktree:/projects/feature"]'),
    ).toBeNull();
    expect(
      host
        .querySelector('[data-herdr-workspace="worktree:/projects/missing"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[data-herdr-workspace="worktree:/projects/new"]',
        )!
        .click(),
    );
    expect(onOpenWorktree).toHaveBeenCalledWith(
      "discover",
      "/projects/new",
      "main",
    );
    expect(onOpenWorktree).toHaveBeenCalledTimes(1);
    const checkout = host.querySelector<HTMLButtonElement>(
      '[data-herdr-workspace="worktree:/projects/new"]',
    )!;
    await act(async () =>
      checkout.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100,
        }),
      ),
    );
    expect(document.querySelector('[role="menuitem"]')?.textContent).toBe(
      "herdr.openWorktree",
    );
    expect(onOpenWorktree).toHaveBeenCalledTimes(1);
    await act(async () =>
      document
        .querySelector('[role="menu"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
    );
    expect(document.querySelector('[role="menu"]')).toBeNull();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[data-herdr-workspace="child"]')!
        .click(),
    );
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("child");
    onOpen.mockClear();
    // The same menu opens both a discovered checkout and an existing workspace.
    for (const id of ["worktree:/projects/new", "child"]) {
      const target = host.querySelector<HTMLButtonElement>(
        `[data-herdr-workspace="${id}"]`,
      )!;
      await act(async () =>
        target.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "F10",
            shiftKey: true,
            bubbles: true,
          }),
        ),
      );
      const items = [
        ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
      ];
      expect(items.map((item) => item.textContent)).toEqual([
        "herdr.openWorktree",
        "herdr.deleteWorktree",
      ]);
      if (id === "child") expect(items[1].disabled).toBe(true);
      await act(async () => items[0].click());
      expect(document.querySelector('[role="menu"]')).toBeNull();
    }
    expect(onOpenWorktree).toHaveBeenCalledTimes(3);
    expect(onOpenWorktree).toHaveBeenLastCalledWith(
      "discover",
      "/projects/feature",
      "main",
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    const main = host.querySelector<HTMLButtonElement>(
      '[data-herdr-workspace="main"]',
    )!;
    await act(async () =>
      main.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }),
      ),
    );
    const rootItems = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ];
    expect(rootItems.map((item) => item.textContent)).toEqual([
      "herdr.openProject",
    ]);
    await act(async () => rootItems[0].click());
    expect(onOpen).toHaveBeenLastCalledWith("main");
  } finally {
    await act(async () => root.unmount());
    load.mockRestore();
    vi.unstubAllGlobals();
  }
});
