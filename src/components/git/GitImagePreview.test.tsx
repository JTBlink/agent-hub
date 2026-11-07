// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { GitFileEditor } from "./GitFileEditor";
import { WorktreeFilePreview } from "../worktree/WorktreeFilePreview";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../i18n", () => ({ default: { t: (key: string) => key } }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(invoke)
    .mockReset()
    .mockImplementation(async (_command, args) => {
      const revision = (args as { revision: string }).revision;
      return new TextEncoder().encode(revision === "working" ? "new" : "old")
        .buffer;
    });
  let serial = 0;
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => `blob:preview-${++serial}`);
      static revokeObjectURL = vi.fn();
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it.each([
  { staged: false, revisions: ["index", "working"] },
  { staged: true, revisions: ["head", "index"] },
  { staged: false, commitSha: "a".repeat(40), revisions: ["parent", "commit"] },
  {
    staged: false,
    commitSha: "a".repeat(40),
    compareWorking: true,
    revisions: ["commit", "working"],
  },
  {
    staged: false,
    commitSha: "a".repeat(40),
    revisionView: true,
    revisions: ["commit"],
  },
])(
  "routes image tabs to the selected versions without a text diff: $revisions",
  async ({ revisions, ...options }) => {
    await act(async () =>
      root.render(
        <GitFileEditor
          activeId="demo"
          root="/workspace"
          selection={{ path: "icon.png", staged: options.staged }}
          files={[]}
          fileView={false}
          onClose={() => {}}
          {...options}
        />,
      ),
    );
    expect(
      vi
        .mocked(invoke)
        .mock.calls.map(([command, args]) => [
          command,
          (args as { revision: string }).revision,
        ]),
    ).toEqual(revisions.map((revision) => ["read_project_image", revision]));
    expect(host.querySelectorAll("img")).toHaveLength(revisions.length);
    expect(host.textContent).not.toContain("git.noDiff");
    if (revisions.length === 2) {
      const images = [...host.querySelectorAll("img")].map(
        (image) => image.src,
      );
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            'button[aria-label="imagePreview.stacked"]',
          )!
          .click(),
      );
      expect(
        host
          .querySelector('[aria-label="imagePreview.stacked"]')
          ?.getAttribute("aria-pressed"),
      ).toBe("true");
      expect(
        [...host.querySelectorAll("img")].map((image) => image.src),
      ).toEqual(images);
    }
  },
);

it("opens images from the file tree without invoking the text reader", async () => {
  await act(async () =>
    root.render(
      <WorktreeFilePreview
        projectId="demo"
        worktreePath="/workspace"
        path="ICON.PNG"
      />,
    ),
  );
  expect(host.querySelector("img")?.alt).toBe("ICON.PNG");
  expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
    "read_project_image",
  ]);
});
