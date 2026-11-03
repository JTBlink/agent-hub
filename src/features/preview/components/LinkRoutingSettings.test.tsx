// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LinkRoutingSettings } from "./LinkRoutingSettings";
import { getSettings, setSettings } from "../../../lib/tauri";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../../lib/tauri", () => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
}));
it("loads persisted preference, commits changes, and retains the previous choice on failure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(getSettings).mockResolvedValue("preview");
  vi.mocked(setSettings).mockResolvedValue(undefined);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onError = vi.fn();
  try {
    await act(async () =>
      root.render(<LinkRoutingSettings onError={onError} />),
    );
    const select = container.querySelector("select")!;
    expect(select.value).toBe("preview");
    const change = async (value: string) =>
      act(async () => {
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    await change("system");
    expect(setSettings).toHaveBeenCalledWith(
      "preview_link_destination",
      "system",
    );
    expect(select.value).toBe("system");
    vi.mocked(setSettings).mockRejectedValueOnce(Error("write failed"));
    await change("preview");
    expect(onError).toHaveBeenCalledOnce();
    expect(select.value).toBe("system");
    await act(async () =>
      root.render(<LinkRoutingSettings onError={() => {}} />),
    );
    expect(getSettings).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
