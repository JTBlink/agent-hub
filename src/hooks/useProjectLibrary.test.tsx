// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { ProjectLibraryStatus } from "../lib/tauri";
import {
  createProjectLibraryStatus,
  createTeamStatus,
} from "../../tests/fixtures/projectSkill";
import { useProjectLibrary } from "./useProjectLibrary";

const api = vi.hoisted(() => ({ status: vi.fn(), repair: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("../lib/tauri", () => ({
  getProjectLibraryStatus: api.status,
  repairProjectLibrarySkill: api.repair,
}));
vi.mock("sonner", () => ({ toast }));
const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
const t = i18n.t.bind(i18n);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
const onChanged = vi.fn().mockResolvedValue(undefined);
const stale = createProjectLibraryStatus([createTeamStatus()]);
const clean = createProjectLibraryStatus([createTeamStatus("demo", false)]);
let container: HTMLDivElement;
let root: Root;
function Harness({
  projectId,
  enabled,
}: {
  projectId?: string;
  enabled: boolean;
}) {
  const library = useProjectLibrary(projectId, enabled, null, onChanged);
  return (
    <>
      <p>{JSON.stringify(library.status?.skills)}</p>
      <button
        type="button"
        disabled={library.repairingDirectory !== null}
        onClick={() => void library.repair("demo")}
      >
        repair
      </button>
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  api.status.mockResolvedValue(stale);
  api.repair.mockResolvedValue(clean);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(
  projectId: string | undefined = "project",
  enabled = true,
) {
  await act(async () =>
    root.render(<Harness projectId={projectId} enabled={enabled} />),
  );
}
function deferredReport() {
  let resolve: (status: ProjectLibraryStatus) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<ProjectLibraryStatus>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}
it("refreshes status and the scan after repair while preventing duplicate requests", async () => {
  const pending = deferredReport();
  api.repair.mockReturnValueOnce(pending.promise);
  await render();
  await act(async () => {
    container.querySelector("button")?.click();
    container.querySelector("button")?.click();
  });
  expect(api.repair).toHaveBeenCalledExactlyOnceWith("project", "demo");
  expect(container.querySelector("button")?.disabled).toBe(true);
  api.status.mockResolvedValue(clean);
  await act(async () => pending.resolve(clean));
  expect(onChanged).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('"stale_targets":[]');
  expect(container.querySelector("button")?.disabled).toBe(false);
});
it("keeps failed repairs retryable without reloading or clearing the stale status", async () => {
  api.repair.mockRejectedValueOnce(new Error("local edits protected"));
  await render();
  await act(async () => container.querySelector("button")?.click());
  expect(toast.error).toHaveBeenCalledWith("local edits protected");
  expect(onChanged).not.toHaveBeenCalled();
  expect(container.querySelector("button")?.disabled).toBe(false);
  expect(container.textContent).toContain('"stale_targets":["claude_code"]');
  api.status.mockResolvedValue(clean);
  await act(async () => container.querySelector("button")?.click());
  expect(api.repair).toHaveBeenCalledTimes(2);
  expect(onChanged).toHaveBeenCalledOnce();
});
it("does not reload the old project or display its repair result after navigation", async () => {
  const pending = deferredReport();
  api.repair.mockReturnValueOnce(pending.promise);
  await render("old-project");
  await act(async () => container.querySelector("button")?.click());
  const next = createProjectLibraryStatus([createTeamStatus("next", false)]);
  api.status.mockResolvedValue(next);
  await render("new-project");
  await act(async () => pending.resolve(clean));
  expect(onChanged).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
  expect(container.textContent).toContain('"directory":"next"');
  expect(container.textContent).not.toContain('"directory":"demo"');
});
it("does not let a status request from before the repair overwrite its result", async () => {
  const pending = deferredReport();
  api.status.mockReturnValueOnce(pending.promise);
  await render();
  api.status.mockResolvedValue(clean);
  await act(async () => container.querySelector("button")?.click());
  await act(async () => pending.resolve(stale));
  expect(container.textContent).toContain('"stale_targets":[]');
});
it("skips project library requests for linked workspaces", async () => {
  await render("linked", false);
  expect(api.status).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button")?.click());
  expect(api.repair).not.toHaveBeenCalled();
});
