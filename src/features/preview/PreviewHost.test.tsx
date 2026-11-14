// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { PreviewHost } from "./PreviewHost";
import { consumePreviewRequests, queuePreviewWeb } from "./shared/openRequests";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./PreviewWorkspace", () => ({
  PreviewWorkspace: function Workspace() {
    useEffect(
      () =>
        consumePreviewRequests((request) => {
          document.documentElement.dataset.openedLink = JSON.stringify(request);
        }),
      [],
    );
    return <div data-workspace />;
  },
}));
function Host() {
  return <PreviewHost active={useLocation().pathname === "/preview"} />;
}
it("opens a lazy workspace from another module and delivers the pending web request", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/other"]}>
          <Host />
        </MemoryRouter>,
      ),
    );
    expect(container.querySelector("[data-workspace]")).toBeNull();
    await act(async () => {
      queuePreviewWeb("https://example.invalid");
    });
    expect(container.querySelector("[data-workspace]")).not.toBeNull();
    expect(JSON.parse(document.documentElement.dataset.openedLink!)).toEqual({
      kind: "web",
      address: "https://example.invalid",
      profile: "default",
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    delete document.documentElement.dataset.openedLink;
    vi.unstubAllGlobals();
  }
});
