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
