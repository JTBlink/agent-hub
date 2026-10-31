// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../lib/tauri";
import { automationOverviewCache } from "../lib/automationOverviewCache";
import { useAutomationOverview } from "./useAutomationOverview";

vi.mock("../lib/tauri", () => ({
  getAutomationOverview: vi.fn(),
  onAutomationChanged: vi.fn(),
}));

function overview(name: string): api.AutomationOverview {
  return {
    tasks: [],
    issues: [{ source: "agent_hub", message: name }],
    hermes_installed: false,
  };
}

function deferred() {
  let resolve!: (value: api.AutomationOverview) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<api.AutomationOverview>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

let root: Root;
let host: HTMLDivElement;
function Harness({ locale = "zh" }: { locale?: string }) {
  const { data, loading, error, refresh } = useAutomationOverview(locale);
  return (
    <section aria-busy={loading}>
      <output>{data?.issues[0]?.message ?? "empty"}</output>
      <p role="alert">{error}</p>
      <button onClick={refresh}>refresh</button>
    </section>
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  automationOverviewCache.clear();
  vi.mocked(api.getAutomationOverview).mockReset();
  vi.mocked(api.onAutomationChanged)
    .mockReset()
    .mockResolvedValue(() => {});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  automationOverviewCache.clear();
  vi.unstubAllGlobals();
});

async function render(locale = "zh") {
  await act(async () =>
    root.render(
      <StrictMode>
        <Harness locale={locale} />
      </StrictMode>,
    ),
  );
}

it("shows cached tasks immediately on return while revalidating in the background", async () => {
  vi.mocked(api.getAutomationOverview).mockResolvedValueOnce(
    overview("cached"),
  );
  await render();
  await act(async () => root.render(null));
  const pending = deferred();
  vi.mocked(api.getAutomationOverview).mockReturnValueOnce(pending.promise);
  await render();
  expect(host.querySelector("output")?.textContent).toBe("cached");
  expect(host.querySelector("section")?.getAttribute("aria-busy")).toBe(
    "false",
  );
  expect(api.getAutomationOverview).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve(overview("updated")));
  expect(host.querySelector("output")?.textContent).toBe("updated");
});

it("shares pending reads across route switches and caches completion while unmounted", async () => {
  const pending = deferred();
  vi.mocked(api.getAutomationOverview).mockReturnValueOnce(pending.promise);
  await render();
  await act(async () => root.render(null));
  await render();
  expect(api.getAutomationOverview).toHaveBeenCalledOnce();
  await act(async () => root.render(null));
  await act(async () => pending.resolve(overview("completed offscreen")));
  const revalidation = deferred();
  vi.mocked(api.getAutomationOverview).mockReturnValueOnce(
    revalidation.promise,
  );
  await render();
  expect(host.querySelector("output")?.textContent).toBe("completed offscreen");
  expect(host.querySelector("section")?.getAttribute("aria-busy")).toBe(
    "false",
  );
});

it("keeps cached data on a background failure and allows a manual retry", async () => {
  vi.mocked(api.getAutomationOverview).mockResolvedValueOnce(
    overview("cached"),
  );
  await render();
  await act(async () => root.render(null));
  vi.mocked(api.getAutomationOverview).mockRejectedValueOnce(
    new Error("unavailable"),
  );
  await render();
  expect(host.querySelector("output")?.textContent).toBe("cached");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("unavailable");
  const retry = deferred();
  vi.mocked(api.getAutomationOverview).mockReturnValueOnce(retry.promise);
  await act(async () => host.querySelector("button")!.click());
  expect(host.querySelector("section")?.getAttribute("aria-busy")).toBe("true");
  expect(host.querySelector("output")?.textContent).toBe("cached");
  await act(async () => retry.resolve(overview("retried")));
  expect(host.querySelector("output")?.textContent).toBe("retried");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("");
});

it("does not let a response started before a mutation overwrite refreshed data", async () => {
  const old = deferred();
  const current = deferred();
  vi.mocked(api.getAutomationOverview)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(current.promise);
  await render();
  await act(async () => host.querySelector("button")!.click());
  await act(async () => current.resolve(overview("after mutation")));
  await act(async () => old.resolve(overview("before mutation")));
  expect(host.querySelector("output")?.textContent).toBe("after mutation");
  expect(host.querySelector("section")?.getAttribute("aria-busy")).toBe(
    "false",
  );
});

it("keeps language caches separate even when the previous language finishes late", async () => {
  const chinese = deferred();
  vi.mocked(api.getAutomationOverview)
    .mockReturnValueOnce(chinese.promise)
    .mockResolvedValueOnce(overview("English"));
  await render();
  await render("en");
  await act(async () => chinese.resolve(overview("中文")));
  expect(host.querySelector("output")?.textContent).toBe("English");
  const revalidation = deferred();
  vi.mocked(api.getAutomationOverview).mockReturnValueOnce(
    revalidation.promise,
  );
  await render("zh");
  expect(host.querySelector("output")?.textContent).toBe("中文");
  expect(host.querySelector("section")?.getAttribute("aria-busy")).toBe(
    "false",
  );
});

it("shares one read and publishes updates to concurrent consumers", async () => {
  const pending = deferred();
  vi.mocked(api.getAutomationOverview).mockReturnValueOnce(pending.promise);
  await act(async () =>
    root.render(
      <>
        <Harness />
        <Harness />
      </>,
    ),
  );
  expect(api.getAutomationOverview).toHaveBeenCalledOnce();
  await act(async () => pending.resolve(overview("shared")));
  vi.mocked(api.getAutomationOverview).mockResolvedValueOnce(
    overview("refreshed"),
  );
  await act(async () => host.querySelector("button")!.click());
  expect(
    [...host.querySelectorAll("output")].map((node) => node.textContent),
  ).toEqual(["refreshed", "refreshed"]);
});
