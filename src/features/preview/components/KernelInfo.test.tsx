// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { KernelInfo } from "./KernelInfo";
import { previewApi } from "../api";
import { nativeApi } from "../web/native/api";
vi.mock("../api", () => ({ previewApi: { kernel: vi.fn() } }));
vi.mock("../web/native/api", () => ({ nativeApi: { info: vi.fn() } }));
vi.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
it("keeps engine details inside About and queries the selected backend only when expanded", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(previewApi.kernel).mockResolvedValue({
    product: "Chrome/123",
    userAgent: "Synthetic Chromium UA",
    protocolVersion: "1.3",
  });
  vi.mocked(nativeApi.info).mockResolvedValue({
    engine: "WKWebView",
    version: "123",
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(<KernelInfo backend="chromium" pageId="page" />),
    );
    expect(host.querySelector("summary")?.textContent).toBe("settings.about");
    expect(host.textContent).not.toContain("preview.chromiumKernel");
    expect(previewApi.kernel).not.toHaveBeenCalled();
    await act(async () => {
      const details = host.querySelector("details")!;
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    expect(host.textContent).toContain("Chrome/123");
    expect(host.textContent).toContain("Synthetic Chromium UA");
    expect(previewApi.kernel).toHaveBeenCalledWith("page");
    await act(async () => root.render(<KernelInfo backend="native" />));
    expect(host.textContent).toContain("preview.systemKernel");
    expect(host.textContent).toContain("WKWebView");
    expect(host.textContent).not.toContain("Synthetic Chromium UA");
    expect(nativeApi.info).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  }
});
