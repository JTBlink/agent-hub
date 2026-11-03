// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HerdrWorkspaceRow } from "./HerdrWorkspaceRow";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("shows the checkout directory and branch on separate lines", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const onOpen = vi.fn();

  try {
    await act(async () =>
      root.render(
        <HerdrWorkspaceRow
          workspace={{
            workspace_id: "checkout",
            label: "custom label",
            active_tab_id: "tab",
            directory: "/projects/demo-work-issue",
            branch: "fix/issue-macos",
          }}
          agents={[]}
          selected
          disabled={false}
          connector="last"
          onOpen={onOpen}
        />,
      ),
    );

    const row = host.querySelector<HTMLButtonElement>(
      '[data-herdr-workspace="checkout"]',
    )!;
    expect(row.querySelector("[data-herdr-directory]")?.textContent).toBe(
      "demo-work-issue",
    );
    expect(row.querySelector("[data-herdr-branch]")?.textContent).toBe(
      "fix/issue-macos",
    );
    expect(row.querySelector("[data-herdr-branch]")?.className).toContain(
      "text-muted",
    );
    expect(row.getAttribute("aria-label")).toBe(
      "demo-work-issue fix/issue-macos",
    );
    expect(
      row.querySelector('[data-herdr-connector="last"]'),
    ).not.toBeNull();
    await act(async () => row.click());
    expect(onOpen).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
