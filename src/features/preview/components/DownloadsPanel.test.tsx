// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DownloadsPanel } from "./DownloadsPanel";
import { previewApi, type PreviewDownload } from "../api";
const t = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("../api", () => ({
  previewApi: {
    downloads: vi.fn(),
    fetchDownload: vi.fn(),
    cancelTransfer: vi.fn(),
    forgetDownload: vi.fn(),
    cancelDownload: vi.fn(),
    openDownload: vi.fn(),
  },
}));
it("shows unverified progress and removes only a completed record after native success", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let items: PreviewDownload[] = [
    {
      id: "completed",
      profile: "default",
      name: "report.txt",
      state: "completed",
      received: 10,
      total: 10,
      local: true,
      verified: true,
    },
    {
      id: "active",
      profile: "guest",
      name: "pending.txt",
      state: "inProgress",
      received: 5,
      total: 20,
      local: true,
      verified: false,
    },
  ];
  const beforeRemoval = items;
  let resolveOldPoll!: (items: PreviewDownload[]) => void;
  let requests = 0;
  vi.mocked(previewApi.downloads).mockImplementation(async () => {
    requests += 1;
    if (requests === 2)
      return new Promise((resolve) => {
        resolveOldPoll = resolve;
      });
    return items;
  });
  vi.mocked(previewApi.forgetDownload).mockImplementation(
    async (profile, id) => {
      items = items.filter(
        (item) => item.profile !== profile || item.id !== id,
      );
    },
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <DownloadsPanel model={{ report: vi.fn(), setPanelOpen: vi.fn() }} />,
      ),
    );
    expect(container.textContent).toContain("preview.downloadUnverified");
    const remove = [...container.querySelectorAll("button")].filter((button) =>
      button.textContent?.includes("preview.removeDownload"),
    );
    expect(remove).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => remove[0].click());
    expect(previewApi.forgetDownload).toHaveBeenCalledWith(
      "default",
      "completed",
    );
    await act(async () => {
      resolveOldPoll(beforeRemoval);
    });
    expect(container.textContent).not.toContain("report.txt");
    expect(container.textContent).toContain("pending.txt");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  }
});

it("labels completed remote artifacts without offering local file actions", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(previewApi.downloads).mockResolvedValue([
    {
      id: "remote-artifact",
      profile: "remote",
      name: "server.bin",
      state: "completed",
      received: 20,
      total: 20,
      local: false,
      remote: true,
      verified: true,
    },
  ]);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <DownloadsPanel model={{ report: vi.fn(), setPanelOpen: vi.fn() }} />,
      ),
    );
    expect(container.textContent).toContain("preview.remoteDownloadLocation");
    expect(container.textContent).toContain(
      "preview.remoteDownloadPendingTransfer",
    );
    expect(
      [...container.querySelectorAll("button")].some(
        (button) => button.textContent === "fileTree.open",
      ),
    ).toBe(false);
    expect(
      [...container.querySelectorAll("button")].some(
        (button) => button.textContent === "preview.revealDownload",
      ),
    ).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  }
});

it("retrieves remote files, cancels transfer, retries failures and exposes only the completed local copy", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  let item: PreviewDownload = {
    id: "remote-file",
    profile: "remote",
    name: "report.bin",
    state: "completed",
    received: 2048,
    total: 2048,
    local: false,
    remote: true,
    verified: true,
  };
  vi.mocked(previewApi.downloads).mockImplementation(async () => [item]);
  vi.mocked(previewApi.fetchDownload).mockImplementation(async () => {
    item = { ...item, transfer: { state: "running", received: 1024 } };
  });
  vi.mocked(previewApi.cancelTransfer).mockImplementation(async () => {
    item = { ...item, transfer: { state: "canceling", received: 1024 } };
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const button = (text: string) =>
    [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes(text),
    )!;
  try {
    await act(async () =>
      root.render(
        <DownloadsPanel model={{ report: vi.fn(), setPanelOpen: vi.fn() }} />,
      ),
    );
    await act(async () => button("preview.fetchDownload").click());
    expect(previewApi.fetchDownload).toHaveBeenCalledWith(
      "remote",
      "remote-file",
    );
    expect(button("preview.removeDownload").disabled).toBe(true);
    await act(async () => button("common.cancel").click());
    expect(previewApi.cancelTransfer).toHaveBeenCalledWith(
      "remote",
      "remote-file",
    );
    expect(button("common.cancel").disabled).toBe(true);
    item = {
      ...item,
      transfer: { state: "failed", received: 1024, error: "authentication" },
    };
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "preview.transferError.authentication",
    );
    await act(async () => button("preview.fetchDownload").click());
    item = {
      ...item,
      local: true,
      transfer: { state: "completed", received: 2048 },
    };
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(button("fileTree.open").disabled).toBe(false);
    expect(button("preview.revealDownload").disabled).toBe(false);
    expect(container.textContent).not.toContain(
      "preview.remoteDownloadPendingTransfer",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  }
});
