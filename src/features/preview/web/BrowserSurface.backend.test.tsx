// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserSurface } from "./BrowserSurface";
import { previewApi } from "../api";
vi.mock("../api", () => ({ previewApi: { info: vi.fn() } }));
vi.mock("./chromium/ChromiumSurface", () => ({
  ChromiumSurface: ({ onUnavailable }: { onUnavailable: () => void }) => (
    <button onClick={onUnavailable}>missing Chromium</button>
  ),
}));
vi.mock("./native/NativeSurface", () => ({
  NativeSurface: () => <div>native surface</div>,
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["native", "default", "proxy"])(
  "selects an isolated backend without bypassing network policy: %s",
  async (profile) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.mocked(previewApi.info).mockResolvedValue({
      executable: null,
      profiles: [
        {
          id: profile,
          name: profile,
          proxy: profile === "proxy" ? "http://127.0.0.1:7890" : null,
        },
      ],
    });
    const host = document.createElement("div");
    const root = createRoot(host);
    const onBackend = vi.fn();
    try {
      await act(async () =>
        root.render(
          <BrowserSurface
            tabId="tab"
            address="about:blank"
            profile={profile}
            active
            picking={false}
            viewport={null}
            onReady={() => {}}
            onFrame={() => {}}
            onCapture={() => {}}
            onError={() => {}}
            onBackend={onBackend}
          />,
        ),
      );
      if (profile !== "native")
        await act(async () => host.querySelector("button")!.click());
      expect(host.textContent).toBe(
        profile === "proxy" ? "missing Chromium" : "native surface",
      );
      expect(onBackend).toHaveBeenLastCalledWith(
        profile === "proxy" ? "chromium" : "native",
      );
    } finally {
      await act(async () => root.unmount());
    }
  },
);
