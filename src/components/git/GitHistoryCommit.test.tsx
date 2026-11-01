// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GitHistoryCommit } from "./GitHistoryCommit";
import { getProjectGitCommit } from "../../lib/gitApi";
const translate = (key: string) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate, i18n: { language: "en" } }),
}));
vi.mock("../../lib/gitApi", () => ({ getProjectGitCommit: vi.fn() }));

it("shows minute precision and lazy hover details, shares inspection with the tree and closes with Escape", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const commit = {
    sha: "c".repeat(40),
    summary: "Improve navigation",
    author: "example",
    time: 1793408455,
  };
  vi.mocked(getProjectGitCommit).mockResolvedValue({
    ...commit,
    message: "Improve navigation\n\nFull explanation",
    committer: "example",
    author_email: "user@example.invalid",
    committer_email: "user@example.invalid",
    parents: [],
    files: [{ path: "demo.txt", old_path: null, status: "added" }],
    additions: 8,
    deletions: 2,
    truncated: false,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (open: boolean) => (
    <ul>
      <GitHistoryCommit
        commit={commit}
        branch="main"
        isHead
        open={open}
        target={{ projectId: "hover-example" }}
        onSelect={vi.fn()}
        onExpandedChange={vi.fn()}
      />
    </ul>
  );
  try {
    await act(async () => root.render(render(false)));
    expect(getProjectGitCommit).not.toHaveBeenCalled();
    const summary = host.querySelector("summary")!;
    const time = summary.querySelector("time")!;
    expect(time.textContent).toMatch(/\d{2}:\d{2}/);
    expect(time.title).not.toMatch(/\d{2}:\d{2}:\d{2}/);
    await act(async () =>
      summary.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })),
    );
    await act(async () => vi.advanceTimersByTime(350));
    const tooltip = document.querySelector('[role="tooltip"]')!;
    expect(tooltip.textContent).toContain("Full explanation");
    expect(tooltip.textContent).toContain("+8");
    expect(tooltip.textContent).toContain("−2");
    expect(summary.getAttribute("aria-describedby")).toBe(tooltip.id);
    expect(getProjectGitCommit).toHaveBeenCalledTimes(1);
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () =>
      summary.dispatchEvent(new FocusEvent("focusin", { bubbles: true })),
    );
    await act(async () => vi.advanceTimersByTime(350));
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    await act(async () =>
      summary.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
    );
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await act(async () => root.render(render(true)));
    expect(getProjectGitCommit).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("demo.txt");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
