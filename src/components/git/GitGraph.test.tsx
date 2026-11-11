// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GitGraph } from "./GitGraph";
import type { GitGraphCommit } from "../../lib/gitApi";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("../../hooks/useGitGraph", () => ({
  useGitGraph: () => ({ data: { commits, has_more: false }, loading: false }),
}));
vi.mock("./GitCommitDetails", () => ({
  GitCommitDetails: ({ sha }: { sha: string }) => <p data-inspector>{sha}</p>,
}));
const commits: GitGraphCommit[] = Array.from({ length: 500 }, (_, index) => ({
  sha: `sha-${index}`,
  summary: `Commit ${index}`,
  author: "Example",
  time: 0,
  parents: index < 499 ? [`sha-${index + 1}`] : [],
  refs: index === 10 ? [{ name: "origin/topic", remote: true }] : [],
}));

it("clears a selected remote branch when remote visibility is disabled and does not restore it on re-enabling", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <GitGraph
          target={{ projectId: "demo" }}
          revision={0}
          changedFiles={0}
          busy={false}
          fetching={false}
          onSelect={() => {}}
          onClose={() => {}}
          onFetch={() => {}}
          onRefresh={() => {}}
        />,
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    await act(async () => trigger.click());
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
        .find((option) => option.textContent === "origin/topic")!
        .click(),
    );
    expect(trigger.textContent).toBe("origin/topic");
    const remotes = host.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    await act(async () => remotes.click());
    expect(trigger.textContent).toBe("git.graph.allBranches");
    await act(async () => remotes.click());
    expect(trigger.textContent).toBe("git.graph.allBranches");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("opens requested tag details, reveals virtualized rows and only explains missing requested commits", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (focusCommit?: { sha: string }) =>
    act(async () =>
      root.render(
        <GitGraph
          target={{ projectId: "demo" }}
          revision={0}
          changedFiles={0}
          busy={false}
          fetching={false}
          onSelect={() => {}}
          onClose={() => {}}
          onFetch={() => {}}
          onRefresh={() => {}}
          focusCommit={focusCommit}
        />,
      ),
    );
  try {
    await render();
    expect(host.textContent).not.toContain("git.tagActions.outsideGraph");
    expect(host.querySelector("[data-inspector]")).toBeNull();
    await render({ sha: "sha-400" });
    expect(host.querySelector("[data-inspector]")?.textContent).toBe("sha-400");
    expect(
      host
        .querySelector('[data-commit-index="400"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      host.querySelector("table")!.parentElement!.scrollTop,
    ).toBeGreaterThan(10000);
    await render({ sha: "outside" });
    expect(host.querySelector("[data-inspector]")?.textContent).toBe("outside");
    expect(host.textContent).toContain("git.tagActions.outsideGraph");
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "missing");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await render({ sha: "sha-400" });
    expect(input.value).toBe("");
    expect(host.textContent).not.toContain("git.tagActions.outsideGraph");
    expect(host.querySelector('[data-commit-index="400"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
