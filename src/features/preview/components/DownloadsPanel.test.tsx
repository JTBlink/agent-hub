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
