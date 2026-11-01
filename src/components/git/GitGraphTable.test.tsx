// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GitGraphTable } from "./GitGraphTable";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));
it("windows a large history, preserves full topology and navigates to unmounted rows with the keyboard", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const commits = Array.from({ length: 5000 }, (_, index) => ({
    sha: String(index),
    summary: `Commit ${index}`,
    author: "Example",
    time: 0,
    refs: [],
    parents: index < 4999 ? [String(index + 1)] : [],
  }));
  const onSelect = vi.fn();
  try {
    await act(async () =>
      root.render(
        <GitGraphTable
          commits={commits}
          query=""
          changedFiles={0}
          loading={false}
          onSelect={onSelect}
        />,
      ),
    );
    expect(host.querySelectorAll("svg").length).toBeLessThan(50);
    expect(host.querySelector("table")?.getAttribute("aria-rowcount")).toBe(
      "5001",
    );
    const first = host.querySelector<HTMLButtonElement>(
      "[data-commit-index='0']",
    )!;
    await act(async () =>
      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      ),
    );
    const last = host.querySelector<HTMLButtonElement>(
      "[data-commit-index='4999']",
    )!;
    expect(last).not.toBeNull();
    expect(document.activeElement).toBe(last);
    expect(host.querySelectorAll("svg").length).toBeLessThan(50);
    // The first rendered row still has its incoming edge from the hidden history.
    expect(host.querySelector("tbody svg path")).not.toBeNull();
    await act(async () => last.click());
    expect(onSelect).toHaveBeenCalledWith("4999");
    await act(async () =>
      last.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
      ),
    );
    expect(document.activeElement?.getAttribute("data-commit-index")).toBe("0");
    const scroller = host.firstElementChild!;
    await act(async () => {
      scroller.scrollTop = 75000;
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(host.querySelector("[data-commit-index='2500']")).not.toBeNull();
    expect(host.querySelector("[data-commit-index='0']")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("renders combined colored branch badges and connects working changes to the actual HEAD", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const name = "docs/example-long-branch-name-with-several-path-segments";
  const commits = [
    {
      sha: "docs-a",
      summary: "Documentation update",
      author: "Example",
      time: 0,
      parents: ["head"],
      refs: [
        { name, remote: false },
        { name: `origin/${name}`, remote: true, remote_name: "origin" },
      ],
    },
    {
      sha: "docs-b",
      summary: "Another update",
      author: "Example",
      time: 0,
      parents: ["head"],
      refs: [{ name: "docs/other", remote: false }],
    },
    {
      sha: "head",
      head: true,
      summary: "Merge topic",
      author: "Example",
      time: 0,
      parents: [],
      refs: [
        { name: "main", remote: false, current: true },
        { name: "origin/main", remote: true, remote_name: "origin" },
        { name: "origin/HEAD", remote: true, remote_name: "origin" },
      ],
    },
  ];
  try {
    await act(async () =>
      root.render(
        <GitGraphTable
          commits={commits}
          changedFiles={13}
          query=""
          loading={false}
          onSelect={() => {}}
        />,
      ),
    );
    const row = (index: number) =>
      host.querySelector(`[data-commit-index="${index}"]`)!.closest("tr")!;
    expect(row(0).querySelectorAll("[data-graph-ref]")).toHaveLength(1);
    expect(row(0).querySelector("[data-graph-ref]")?.textContent).toBe(
      `${name}origin`,
    );
    expect(
      row(0).querySelector("[data-graph-ref]")?.getAttribute("title"),
    ).toContain(`origin/${name}`);
    expect(row(0).textContent).toContain("Documentation update");
    expect(
      row(0).querySelector("[data-graph-ref]")?.getAttribute("style"),
    ).not.toBe(row(1).querySelector("[data-graph-ref]")?.getAttribute("style"));
    expect(row(2).querySelectorAll("[data-graph-ref]")).toHaveLength(2);
    expect(row(2).textContent).toContain("origin/HEAD");
    const workingSvg = host.querySelector("tbody tr svg")!;
    const headSvg = row(2).querySelector("svg")!;
    expect(workingSvg.querySelector("path")).not.toBeNull();
    expect(workingSvg.querySelector("circle")?.getAttribute("cx")).toBe(
      headSvg.querySelector("circle")?.getAttribute("cx"),
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
