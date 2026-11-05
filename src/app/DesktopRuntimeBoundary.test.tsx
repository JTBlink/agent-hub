// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DesktopRuntimeBoundary } from "./DesktopRuntimeBoundary";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("explains the missing desktop environment without mounting native data providers in a browser", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const loadDesktopData = vi.fn();
  function DesktopApp() {
    useEffect(() => {
      loadDesktopData();
    }, []);
    return <p>Desktop workspace</p>;
  }
  try {
    await act(async () =>
      root.render(
        <DesktopRuntimeBoundary desktop={false}>
          <DesktopApp />
        </DesktopRuntimeBoundary>,
      ),
    );
    expect(host.querySelector("h1")?.textContent).toBe("desktopRuntime.title");
    expect(loadDesktopData).not.toHaveBeenCalled();
    expect(host.querySelector("a")?.getAttribute("href")).toBe(
      "/docs/prototypes/",
    );
    await act(async () =>
      root.render(
        <DesktopRuntimeBoundary desktop>
          <DesktopApp />
        </DesktopRuntimeBoundary>,
      ),
    );
    expect(loadDesktopData).toHaveBeenCalledOnce();
    expect(host.textContent).toBe("Desktop workspace");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
