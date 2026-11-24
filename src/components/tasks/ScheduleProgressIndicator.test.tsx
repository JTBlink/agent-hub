// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ScheduleProgressIndicator } from "./ScheduleProgressIndicator";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
it("shows circular job progress and does not claim a percentage for partial data", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const progress = {
    total: 6,
    finished: 4,
    running: 1,
    waiting: 1,
    limited: false,
    status: "running",
  };
  try {
    await act(async () =>
      root.render(<ScheduleProgressIndicator result={{ progress }} />),
    );
    const meter = host.querySelector('[role="progressbar"]');
    expect(meter?.tagName.toLowerCase()).toBe("svg");
    expect(meter?.getAttribute("aria-valuenow")).toBe("4");
    expect(meter?.getAttribute("aria-valuemax")).toBe("6");
    expect(meter?.querySelector("title")?.textContent).toContain(
      "schedules.progress.activity",
    );
    await act(async () =>
      root.render(
        <ScheduleProgressIndicator
          result={{ progress: { ...progress, limited: true } }}
        />,
      ),
    );
    expect(
      host.querySelector('[role="progressbar"]')?.hasAttribute("aria-valuenow"),
    ).toBe(false);
    await act(async () =>
      root.render(<ScheduleProgressIndicator result={{ unavailable: true }} />),
    );
    expect(
      host.querySelector('[role="progressbar"]')?.hasAttribute("aria-valuemax"),
    ).toBe(false);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
