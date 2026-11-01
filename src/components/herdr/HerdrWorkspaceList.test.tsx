// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HerdrWorkspaceList } from "./HerdrWorkspaceList";
import { groupHerdrWorkspaces } from "../../lib/herdrWorkspaces";
import type { HerdrWorkspace } from "../../lib/herdrControlApi";
vi.mock("react-i18next", () => ({
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
