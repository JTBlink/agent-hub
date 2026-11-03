// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { FileContent } from "./FileContent";
import { openWebLink } from "../../lib/openWebLink";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../lib/openWebLink", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/openWebLink")>()),
  openWebLink: vi.fn().mockResolvedValue(undefined),
}));
it("routes file-reader web links through the shared preference without authorizing local paths", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <FileContent
          file={{
            path: "guide.md",
            content:
              "[Website](https://example.invalid/page) [Local](./private.md) [Script](javascript:alert(1))",
          }}
          showOpenInVscode={false}
        />,
      ),
    );
    const links = container.querySelectorAll("article a");
    expect(links).toHaveLength(1);
    await act(async () =>
      links[0].dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          shiftKey: true,
        }),
      ),
    );
    expect(openWebLink).toHaveBeenCalledExactlyOnceWith(
      "https://example.invalid/page",
      { invert: true },
    );
    expect(container.querySelector('a[href*="private"]')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
