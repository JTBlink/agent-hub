// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import * as api from "../api";
import { HerdrMaintenance } from "./HerdrMaintenance";
vi.mock("../api", () => ({
  checkHerdrUpdate: vi.fn(),
  updateHerdr: vi.fn(),
  restartHerdrSession: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
it("prepares updates separately and restarts only after confirmation, retaining failures for retry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api.checkHerdrUpdate).mockResolvedValue({
    has_update: true,
    managed: true,
    latest_version: "1.2.3",
  });
  const onRefresh = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const click = (text: string) =>
    act(async () =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === text)!
        .click(),
    );
  try {
    await act(async () =>
      root.render(
        <HerdrMaintenance
          session="demo"
          disabled={false}
          onRefresh={onRefresh}
        />,
      ),
    );
    expect(document.querySelector('[role="menu"]')).toBeNull();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="herdr.moreActions"]')!
        .click(),
    );
    await click("herdr.checkUpdate");
    expect(api.updateHerdr).not.toHaveBeenCalled();
    await click("herdr.updateVersion");
    expect(api.updateHerdr).toHaveBeenCalledOnce();
    expect(api.restartHerdrSession).not.toHaveBeenCalled();
    await click("herdr.restartSession");
    await click("common.cancel");
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="herdr.moreActions"]')!
        .click(),
    );
    expect(api.restartHerdrSession).not.toHaveBeenCalled();
    await click("herdr.restartSession");
    vi.mocked(api.restartHerdrSession).mockRejectedValueOnce(
      new Error("failed"),
    );
    const confirm = () =>
      act(async () => {
        [
          ...host.querySelectorAll<HTMLButtonElement>(
            '[role="alertdialog"] button',
          ),
        ]
          .at(-1)!
          .click();
      });
    await confirm();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("failed");
    vi.mocked(api.restartHerdrSession).mockResolvedValueOnce(undefined);
    await confirm();
    expect(api.restartHerdrSession).toHaveBeenLastCalledWith("demo");
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
