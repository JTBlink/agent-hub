// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ExecutionLocation } from "./ExecutionLocation";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
it("waits for native verification and reports the Markdown renderer independently", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ExecutionLocation />));
    expect(container.textContent).toBe("preview.locationPending");
    await act(async () =>
      root.render(
        <ExecutionLocation
          execution={{ render: "server", network: "proxy" }}
        />,
      ),
    );
    expect(container.textContent).toContain("preview.renderLocation.server");
    expect(container.textContent).toContain("preview.networkLocation.proxy");
    await act(async () =>
      root.render(
        <ExecutionLocation
          markdown
          execution={{ render: "server", network: "proxy" }}
        />,
      ),
    );
    expect(container.textContent).toContain("preview.renderLocation.client");
    expect(container.textContent).toContain(
      "preview.networkLocation.client_default",
    );
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
