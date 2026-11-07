// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GitGraph } from "./GitGraph";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("../../hooks/useGitGraph", () => ({
  useGitGraph: () => ({ data: { commits, has_more: false }, loading: false }),
}));
vi.mock("./GitCommitDetails", () => ({
  GitCommitDetails: ({ sha }: { sha: string }) => <p data-inspector>{sha}</p>,
}));
const commits = Array.from({ length: 500 }, (_, index) => ({
  sha: `sha-${index}`,
  summary: `Commit ${index}`,
  author: "Example",
  time: 0,
  parents: index < 499 ? [`sha-${index + 1}`] : [],
  refs: [],
}));

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
