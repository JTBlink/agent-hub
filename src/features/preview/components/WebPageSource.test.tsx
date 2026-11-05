// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { previewApi } from "../api";
import { WebPageSource } from "./WebPageSource";

const t = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../api", () => ({ previewApi: { action: vi.fn() } }));
vi.mock("../../../components/file-reader/CodeEditor", () => ({
  CodeEditor: ({
    file,
    onChange,
  }: {
    file: { content: string };
    onChange?: unknown;
  }) => <textarea readOnly={!onChange} value={file.content} />,
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("reads HTML into a read-only viewer and lets failed requests retry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(previewApi.action)
    .mockRejectedValueOnce(new Error("Page unavailable"))
    .mockResolvedValueOnce("<!DOCTYPE html><html><body>Example</body></html>");
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<WebPageSource pageId="page" />));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Page unavailable",
    );
    await act(async () => host.querySelector("button")!.click());
    expect(host.querySelector("textarea")?.value).toContain("<!DOCTYPE html>");
    expect(host.querySelector("textarea")?.readOnly).toBe(true);
  } finally {
    await act(async () => root.unmount());
  }
});

it("ignores an old page response after switching pages", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let resolveOld!: (value: string) => void;
  vi.mocked(previewApi.action)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce("<html>New page</html>");
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<WebPageSource pageId="old" />));
    await act(async () => root.render(<WebPageSource pageId="new" />));
    await act(async () => resolveOld("<html>Old page</html>"));
    expect(host.querySelector("textarea")?.value).toBe("<html>New page</html>");
  } finally {
    await act(async () => root.unmount());
  }
});
