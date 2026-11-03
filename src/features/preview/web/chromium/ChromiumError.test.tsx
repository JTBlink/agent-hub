// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ChromiumError } from "./ChromiumError";
import { previewApi } from "../../api";
vi.mock("../../api", () => ({ previewApi: { killProfileProcess: vi.fn() } }));
vi.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("offers force close only for profile conflicts, disables repeated clicks, and retries after success", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const rootHost = document.createElement("div");
  const root = createRoot(rootHost);
  const retry = vi.fn();
  let finish!: () => void;
  vi.mocked(previewApi.killProfileProcess).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const render = (profileInUse: boolean) =>
    root.render(
      <ChromiumError
        error="profile busy"
        id={null}
        profile="default"
        profileInUse={profileInUse}
        recovering={null}
        onRetry={retry}
        onRecover={() => {}}
      />,
    );
  try {
    await act(async () => render(false));
    expect(rootHost.textContent).not.toContain("preview.profileBusy");
    await act(async () => render(true));
    expect(rootHost.querySelectorAll("button")).toHaveLength(1);
    expect(rootHost.textContent).toContain("preview.profileBusy");
    const button = Array.from(rootHost.querySelectorAll("button")).find(
      (b) => b.textContent === "common.retry",
    )!;
    await act(async () => button.click());
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
    expect(previewApi.killProfileProcess).toHaveBeenCalledExactlyOnceWith(
      "default",
    );
    expect(retry).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(retry).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(false);
    retry.mockClear();
    vi.mocked(previewApi.killProfileProcess).mockRejectedValueOnce(
      new Error("Permission denied"),
    );
    await act(async () => button.click());
    expect(rootHost.textContent).toContain("Permission denied");
    expect(retry).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});
