// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { OpenProjectInVscode } from "./OpenProjectInVscode";
import { openDirectoryInVscode } from "../lib/openInVscode";
import { toast } from "sonner";

const path = "/workspace/topic";
const t = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../lib/openInVscode", () => ({ openDirectoryInVscode: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<OpenProjectInVscode path={path} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const openButton = () =>
  host.querySelector<HTMLButtonElement>(
    '[aria-label="install.scan.openInVscode"]',
  )!;
it("opens the selected worktree directory and blocks repeated clicks while launching", async () => {
  let finish!: () => void;
  vi.mocked(openDirectoryInVscode).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => {
    openButton().click();
    openButton().click();
  });
  expect(openDirectoryInVscode).toHaveBeenCalledExactlyOnceWith(path);
  expect(openButton().disabled).toBe(true);
  await act(async () => finish());
  expect(openButton().disabled).toBe(false);
});
it("reports launch failures and allows retry", async () => {
  vi.mocked(openDirectoryInVscode)
    .mockRejectedValueOnce(new Error("Editor unavailable"))
    .mockResolvedValueOnce();
  await act(async () => openButton().click());
  expect(toast.error).toHaveBeenCalledWith("Editor unavailable");
  expect(openButton().disabled).toBe(false);
  await act(async () => openButton().click());
  expect(openDirectoryInVscode).toHaveBeenCalledTimes(2);
});
it("disables opening without a directory", async () => {
  await act(async () => root.render(<OpenProjectInVscode path="" />));
  expect(openButton().disabled).toBe(true);
  await act(async () => openButton().click());
  expect(openDirectoryInVscode).not.toHaveBeenCalled();
});
