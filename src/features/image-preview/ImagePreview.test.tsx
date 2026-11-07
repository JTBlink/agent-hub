// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImagePreview } from "./ImagePreview";
import { readProjectImage, type ImageSource } from "./api";
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  readProjectImage: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const source: ImageSource = {
  projectId: "demo",
  worktreePath: "/workspace",
  path: "icon.png",
  revision: "working",
};
const data = new Blob(["image"], { type: "image/png" });
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
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(readProjectImage).mockReset();
  let serial = 0;
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => `blob:preview-${++serial}`);
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = async (target = source) =>
  act(async () => root.render(<ImagePreview source={target} />));
async function click(label: string) {
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
      .click(),
  );
}

it("loads a binary image, zooms, expands it and reports decoding errors", async () => {
  vi.mocked(readProjectImage).mockResolvedValue(data);
  await render();
  expect(host.querySelector("img")?.src).toBe("blob:preview-1");
  await click("imagePreview.zoomIn");
  expect(host.textContent).toContain("125%");
  await click("imagePreview.resetZoom");
  expect(host.textContent).toContain("100%");
  await click("imagePreview.expand");
  expect(host.querySelector("dialog[open] img")).not.toBeNull();
  await click("common.close");
  expect(host.querySelector("dialog")).toBeNull();
  await act(async () =>
    host.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "imagePreview.failed",
  );
  await click("settings.refresh");
  expect(host.querySelector("img")).not.toBeNull();
});

it("distinguishes missing versions from failed reads and retries after failure", async () => {
  vi.mocked(readProjectImage)
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error("Read failed"))
    .mockResolvedValue(data);
  await render();
  expect(host.textContent).toContain("imagePreview.absent");
  await click("settings.refresh");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Read failed",
  );
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent === "common.retry")!
      .click(),
  );
  expect(host.querySelector("img")?.src).toBe("blob:preview-1");
});

it("ignores an old response after changing paths and refreshes on Git changes", async () => {
  let complete!: (image: Blob | null) => void;
  vi.mocked(readProjectImage)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    )
    .mockResolvedValue(data);
  await render();
  await render({ ...source, path: "next.png" });
  await act(async () => complete(new Blob(["old"])));
  expect(host.querySelector("img")?.alt).toBe("next.png");
  expect(host.querySelector("img")?.src).toBe("blob:preview-1");
  const updated = new Blob(["new"]);
  vi.mocked(readProjectImage).mockResolvedValue(updated);
  await act(async () => {
    window.dispatchEvent(new Event("project-git-changed"));
    window.dispatchEvent(new Event("worktree-file-saved"));
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  expect(host.querySelector("img")?.src).toBe("blob:preview-2");
});

it("releases Blob URLs when hidden and reloads on activation without retaining image buffers", async () => {
  vi.mocked(readProjectImage).mockResolvedValue(data);
  await render();
  await act(async () =>
    root.render(<ImagePreview source={source} active={false} />),
  );
  expect(host.querySelector("img")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  await render();
  expect(host.querySelector("img")?.src).toBe("blob:preview-2");
  expect(readProjectImage).toHaveBeenCalledTimes(2);
});

it("does not reread immutable commit images on workspace changes", async () => {
  vi.mocked(readProjectImage).mockResolvedValue(data);
  await render({ ...source, revision: "commit", sha: "a".repeat(40) });
  await act(async () => {
    window.dispatchEvent(new Event("project-git-changed"));
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  expect(readProjectImage).toHaveBeenCalledTimes(1);
});
