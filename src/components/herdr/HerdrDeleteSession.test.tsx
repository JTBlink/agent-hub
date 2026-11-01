// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { deleteHerdrSession } from "../../lib/herdrControlApi";
import { HerdrDeleteSession } from "./HerdrDeleteSession";
vi.mock("../../lib/herdrControlApi", () => ({ deleteHerdrSession: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
it("protects default and allows cancel, retry after failure, and confirmed deletion", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onDeleted = vi.fn();
  const render = (name: string) =>
    act(async () =>
      root.render(
        <HerdrDeleteSession
          session={{ name, running: true, default: name === "default" }}
          disabled={false}
          onDeleted={onDeleted}
        />,
      ),
    );
  const click = async (label: string) => {
    const button = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === label || b.getAttribute("aria-label") === label,
    )!;
    await act(async () => button.click());
  };
  try {
    await render("default");
    expect(host.querySelector("button")!.disabled).toBe(true);
    await render("demo");
    await click("herdr.deleteSession");
    await click("common.cancel");
    expect(deleteHerdrSession).not.toHaveBeenCalled();
    await click("herdr.deleteSession");
    vi.mocked(deleteHerdrSession).mockRejectedValueOnce(new Error("try again"));
    await click("common.delete");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("try again");
    expect(host.querySelector('[role="alertdialog"]')).toBeTruthy();
    expect(onDeleted).not.toHaveBeenCalled();
    vi.mocked(deleteHerdrSession).mockResolvedValueOnce(undefined);
    await click("common.delete");
    expect(deleteHerdrSession).toHaveBeenLastCalledWith("demo");
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
