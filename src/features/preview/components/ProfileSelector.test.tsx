// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProfileSelector } from "./ProfileSelector";
import type { PreviewTab } from "../shared/session";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
it("opens another profile in a new tab without modifying the existing page and disables Markdown routing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const open = vi.fn();
  const active: PreviewTab = {
    id: "original",
    kind: "web",
    address: "https://example.invalid/form",
    title: "Form",
    profile: "default",
    revision: "draft",
    history: [],
    cursor: 0,
  };
  const profiles = [
    { id: "default", name: "Default" },
    { id: "remote", name: "Remote" },
  ];
  try {
    await act(async () =>
      root.render(
        <ProfileSelector active={active} profiles={profiles} onOpen={open} />,
      ),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[role="combobox"]')!.click(),
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
        .find((node) => node.textContent === "Remote")!
        .click(),
    );
    expect(open).toHaveBeenCalledExactlyOnceWith(active.address, "remote");
    expect(active.profile).toBe("default");
    expect(active.revision).toBe("draft");
    await act(async () =>
      root.render(
        <ProfileSelector
          active={{ ...active, kind: "markdown" }}
          profiles={profiles}
          onOpen={open}
        />,
      ),
    );
    expect(
      container.querySelector<HTMLButtonElement>('[role="combobox"]')!.disabled,
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
