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
it("shows engine details in the About dialog and queries the selected backend only when its dialog is open", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const showDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "showModal",
  );
  const closeDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "close",
  );
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  const onClose = vi.fn();
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
      root.render(
        <KernelInfo
          open={false}
          onClose={onClose}
          backend="chromium"
          pageId="page"
        />,
      ),
    );
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.body.textContent).not.toContain("preview.chromiumKernel");
    expect(previewApi.kernel).not.toHaveBeenCalled();
    await act(async () =>
      root.render(
        <KernelInfo open onClose={onClose} backend="chromium" pageId="page" />,
      ),
    );
    expect(document.querySelector("dialog")?.open).toBe(true);
    expect(document.body.textContent).toContain("Chrome/123");
    expect(document.body.textContent).toContain("Synthetic Chromium UA");
    expect(previewApi.kernel).toHaveBeenCalledWith("page");
    await act(async () =>
      root.render(<KernelInfo open onClose={onClose} backend="native" />),
    );
    expect(document.body.textContent).toContain("preview.systemKernel");
    expect(document.body.textContent).toContain("WKWebView");
    expect(document.body.textContent).not.toContain("Synthetic Chromium UA");
    expect(nativeApi.info).toHaveBeenCalledOnce();
    await act(async () =>
      document
        .querySelector("dialog button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(
        <KernelInfo open={false} onClose={onClose} backend="native" />,
      ),
    );
    expect(document.querySelector("dialog")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    if (showDescriptor)
      Object.defineProperty(
        HTMLDialogElement.prototype,
        "showModal",
        showDescriptor,
      );
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    if (closeDescriptor)
      Object.defineProperty(
        HTMLDialogElement.prototype,
        "close",
        closeDescriptor,
      );
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    vi.restoreAllMocks();
  }
});
