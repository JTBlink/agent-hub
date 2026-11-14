// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { PreviewHost } from "./PreviewHost";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./PreviewWorkspace", () => {
  throw new Error("Importing a module script failed.");
});

it("keeps navigation available and offers recovery when the preview module cannot load", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const uncaught = vi.fn();
  const root = createRoot(host, {
    onUncaughtError: uncaught,
    onCaughtError: vi.fn(),
  });
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <nav>Workspace navigation</nav>
          <PreviewHost active />
        </MemoryRouter>,
      ),
    );
    expect(host.querySelector("nav")?.textContent).toBe("Workspace navigation");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "preview.loadFailed",
    );
    expect(host.querySelector("button")?.textContent).toBe("preview.reloadApp");
    expect(uncaught).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
