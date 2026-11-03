// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { CookieImportPanel } from "./CookieImportPanel";
import { previewApi, type CookieImportSummary } from "../api";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../api", () => ({
  previewApi: {
    prepareCookies: vi.fn(),
    browserCookies: vi.fn(),
    cookieFile: vi.fn(),
    applyCookies: vi.fn(),
    cancelCookieImport: vi.fn().mockResolvedValue(undefined),
  },
}));
let container: HTMLDivElement, root: Root;
const imported = vi.fn(),
  report = vi.fn();
const summary: CookieImportSummary = {
  id: "preview",
  target: {
    id: "target",
    profile: "default",
    profile_name: "Default",
    revision: "rev1",
    title: "Page",
    url: "https://example.invalid",
  },
  domains: { "a.example.invalid": 1, "b.example.invalid": 1 },
  total: 2,
  importable: 2,
  skipped: { invalid: 0, expired: 0, partitioned: 0, bound: 0 },
};
const render = async (
  id = "target",
  revision = "rev1",
  address = "https://example.invalid",
) =>
  act(async () =>
    root.render(
      <CookieImportPanel
        pageId={id}
        address={address}
        revision={revision}
        onImported={imported}
        onError={report}
      />,
    ),
  );
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.mocked(previewApi.prepareCookies).mockResolvedValue(summary);
  vi.mocked(previewApi.applyCookies).mockResolvedValue({
    imported: 1,
    removed: 0,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const click = async (element: Element) =>
  act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const button = (label: string) => {
  const element = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );
  if (!element) throw Error(`Missing ${label}`);
  return element;
};
const inspect = async () => {
  const input = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, "[]");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(button("preview.inspectImport"));
};
it("previews before mutation and applies only selected domains", async () => {
  await inspect();
  expect(previewApi.applyCookies).not.toHaveBeenCalled();
  await click(
    container.querySelector('[role="switch"][aria-label="b.example.invalid"]')!,
  );
  await click(button("preview.importCookies"));
  expect(previewApi.applyCookies).toHaveBeenCalledExactlyOnceWith(
    "preview",
    ["a.example.invalid"],
    false,
  );
  expect(imported).toHaveBeenCalledWith(1, "Default");
});
it("disables an old preview after target navigation and cancels it when closed", async () => {
  await inspect();
  await render("target", "rev2");
  expect(button("preview.importCookies").disabled).toBe(true);
  await click(button("common.cancel"));
  expect(previewApi.cancelCookieImport).toHaveBeenCalledWith("preview");
  expect(previewApi.applyCookies).not.toHaveBeenCalled();
});
it("cancels a late browser response after the target changes", async () => {
  let resolve!: (summary: CookieImportSummary) => void;
  vi.mocked(previewApi.prepareCookies).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await inspect();
  await render("other", "rev2");
  await act(async () => resolve(summary));
  expect(previewApi.cancelCookieImport).toHaveBeenCalledWith("preview");
  expect(container.querySelector(".preview-import-confirm")).toBeNull();
});

it("invalidates a preview after same-document navigation even with the same loader", async () => {
  await inspect();
  await render("target", "rev1", "https://example.invalid#other-route");
  expect(button("preview.importCookies").disabled).toBe(true);
  expect(previewApi.applyCookies).not.toHaveBeenCalled();
});
