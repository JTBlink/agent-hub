// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HerdrWorktreeMenu } from "./HerdrWorktreeMenu";
import { deleteHerdrWorktree } from "../lib/herdrControlApi";
vi.mock("../lib/herdrControlApi", () => ({ deleteHerdrWorktree: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("opens on right click without navigating and retains failed deletion for retry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onOpen = vi.fn(),
    onDeleted = vi.fn();
  try {
    await act(async () =>
      root.render(
        <HerdrWorktreeMenu
          disabled={false}
          onOpen={onOpen}
          deletion={{
            session: "default",
            projectId: "demo",
            path: "/projects/topic",
            workspaceId: "w1",
            disabled: false,
            onDeleted,
          }}
        >
          <button onClick={onOpen}>topic</button>
        </HerdrWorktreeMenu>,
      ),
    );
    const row = host.querySelector("button")!;
    await act(async () => row.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
    await act(async () =>
      row.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100,
        }),
      ),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((item) => item.textContent === "herdr.deleteWorktree")!
        .click(),
    );
    const confirm = () =>
      [
        ...host.querySelectorAll<HTMLButtonElement>(
          '[role="alertdialog"] button',
        ),
      ].find((b) => b.textContent === "common.delete")!;
    vi.mocked(deleteHerdrWorktree).mockRejectedValueOnce(
      new Error("Local files remain"),
    );
    await act(async () => confirm().click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Local files remain",
    );
    expect(onDeleted).not.toHaveBeenCalled();
    vi.mocked(deleteHerdrWorktree).mockResolvedValueOnce(undefined);
    await act(async () => confirm().click());
    expect(deleteHerdrWorktree).toHaveBeenLastCalledWith(
      "default",
      "demo",
      "/projects/topic",
      "w1",
    );
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
