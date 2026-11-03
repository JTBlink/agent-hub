// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PermissionSettings } from "./PermissionSettings";
import {
  getSystemPermissions,
  openSystemPermissionSettings,
} from "../../lib/systemPermissions";
vi.mock("../../lib/systemPermissions", () => ({
  getSystemPermissions: vi.fn(),
  openSystemPermissionSettings: vi.fn(),
}));
vi.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
it("checks only when visible, keeps unknown authorization explicit, opens one selected pane and refreshes on return", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getSystemPermissions).mockResolvedValue({
    platform: "macos",
    accessibility: false,
    screen_capture: true,
  });
  vi.mocked(openSystemPermissionSettings).mockResolvedValue();
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<PermissionSettings active={false} />));
    expect(getSystemPermissions).not.toHaveBeenCalled();
    await act(async () => root.render(<PermissionSettings active />));
    const rows = host.querySelectorAll("article");
    expect(rows[0].textContent).toContain(
      "settings.permissions.checkInSettings",
    );
    expect(rows[2].textContent).toContain("settings.permissions.notGranted");
    expect(rows[3].textContent).toContain("settings.permissions.granted");
    await act(async () => rows[2].querySelector("button")!.click());
    expect(openSystemPermissionSettings).toHaveBeenCalledExactlyOnceWith(
      "accessibility",
    );
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(getSystemPermissions).toHaveBeenCalledTimes(2);
    vi.mocked(getSystemPermissions).mockRejectedValueOnce(
      new Error("status unavailable"),
    );
    await act(async () => host.querySelector("button")!.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "status unavailable",
    );
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  }
});
