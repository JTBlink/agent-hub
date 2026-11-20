// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../../lib/tauri";
import { GitlabCliSettings } from "./GitlabCliSettings";

vi.mock("../../lib/tauri", () => ({
  getGitlabCliSettings: vi.fn(),
  saveGitlabCliSettings: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api.getGitlabCliSettings).mockResolvedValue({
    search_paths: [],
    path: "/opt/tools/glab",
    source: "installed",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const input = () => host.querySelector("textarea")!;
async function edit(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(label: string) {
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent?.includes(label))!
      .click(),
  );
}
it("shows the discovered executable and saves preferred paths in user order", async () => {
  await act(async () => root.render(<GitlabCliSettings />));
  expect(host.textContent).toContain("/opt/tools/glab");
  await edit(" ~/tools/cli/*/scripts/glab.mjs \n\n/opt/tools/glab ");
  vi.mocked(api.saveGitlabCliSettings).mockResolvedValue({
    search_paths: ["~/tools/cli/*/scripts/glab.mjs", "/opt/tools/glab"],
    path: "/opt/tools/glab",
    source: "custom",
  });
  await click("settings.gitlabCli.save");
  expect(api.saveGitlabCliSettings).toHaveBeenCalledExactlyOnceWith([
    "~/tools/cli/*/scripts/glab.mjs",
    "/opt/tools/glab",
  ]);
  expect(input().value).toBe("~/tools/cli/*/scripts/glab.mjs\n/opt/tools/glab");
  await edit("");
  await click("settings.gitlabCli.save");
  expect(api.saveGitlabCliSettings).toHaveBeenLastCalledWith([]);
});
it("retains unsaved edits on detection and failed saves, allowing retry", async () => {
  await act(async () => root.render(<GitlabCliSettings />));
  await edit("~/tools/custom/glab");
  await click("settings.gitlabCli.detect");
  expect(input().value).toBe("~/tools/custom/glab");
  expect(api.saveGitlabCliSettings).not.toHaveBeenCalled();
  vi.mocked(api.saveGitlabCliSettings).mockRejectedValue(
    new Error("Cannot save CLI search paths"),
  );
  await click("settings.gitlabCli.save");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Cannot save CLI search paths",
  );
  expect(input().value).toBe("~/tools/custom/glab");
  expect(host.querySelector("fieldset")?.disabled).toBe(false);
});
