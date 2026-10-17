// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { SkillGroupErrorsDialog } from "./SkillGroupErrorsDialog";
import { summarizeSkillGroupErrors } from "../lib/skillGroupErrors";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const onForceSync =
  vi.fn<(skillId: string, agentKey: string) => Promise<void>>();
const onComplete = vi.fn<() => Promise<void>>();
let container: HTMLDivElement;
let root: Root;
const notices = summarizeSkillGroupErrors(
  [
    ...["browser", "reviewer", "writer"].map((skillId) => ({
      skillId,
      skillName: skillId,
      agentKey: "hermes",
      error: { kind: "target_conflict", message: "Existing content preserved" },
    })),
    {
      skillId: "other",
      skillName: "other",
      agentKey: "codex",
      error: { kind: "database", message: "Database unavailable" },
    },
  ],
  "Unexpected error",
);
function button(label: string) {
  const result = [...container.querySelectorAll("button")].find(
    (entry) => entry.textContent === label,
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  vi.clearAllMocks();
  onForceSync.mockReset().mockResolvedValue(undefined);
  onComplete.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <SkillGroupErrorsDialog
        notices={notices}
        onClose={vi.fn()}
        onForceSync={onForceSync}
        onComplete={onComplete}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("serializes conflicts, blocks duplicate actions and closing until refresh completes", async () => {
  const first = deferred();
  const refresh = deferred();
  onForceSync.mockReturnValueOnce(first.promise);
  onComplete.mockReturnValueOnce(refresh.promise);
  await act(async () => {
    button("skillGroupActions.forceOverrideAll").click();
    button("skillGroupActions.forceOverrideAll").click();
    button("skillGroupActions.forceOverride").click();
  });
  expect(onForceSync.mock.calls).toEqual([["browser", "hermes"]]);
  expect(button("skillGroupActions.forceOverrideAll").disabled).toBe(true);
  expect(button("common.confirm").disabled).toBe(true);
  const cancel = new Event("cancel", { cancelable: true });
  container.querySelector("dialog")!.dispatchEvent(cancel);
  expect(cancel.defaultPrevented).toBe(true);
  await act(async () => first.resolve());
  expect(onForceSync.mock.calls).toEqual([
    ["browser", "hermes"],
    ["reviewer", "hermes"],
    ["writer", "hermes"],
  ]);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(
    button("skillGroupActions.forceOverrideAll").getAttribute("aria-busy"),
  ).toBe("true");
  expect(button("common.confirm").disabled).toBe(true);
  await act(async () => refresh.resolve());
  expect(container.textContent).not.toContain(
    "skillGroupActions.forceOverrideAll",
  );
  expect(button("common.confirm").disabled).toBe(false);
  expect(
    container.textContent?.match(/skillGroupActions.overridden/g),
  ).toHaveLength(3);
  expect(container.textContent).toContain("Database unavailable");
});

it("continues after failures and retries only unresolved conflicts", async () => {
  onForceSync
    .mockRejectedValueOnce(new Error("First failed"))
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("Third failed"));
  await act(async () => button("skillGroupActions.forceOverrideAll").click());
  expect(onForceSync).toHaveBeenCalledTimes(3);
  expect(toast.error).toHaveBeenCalledWith("First failed");
  expect(toast.error).toHaveBeenCalledWith("Third failed");
  expect(
    container.textContent?.match(/skillGroupActions.overridden/g),
  ).toHaveLength(1);
  await act(async () => button("skillGroupActions.forceOverrideAll").click());
  expect(onForceSync.mock.calls.slice(3)).toEqual([
    ["browser", "hermes"],
    ["writer", "hermes"],
  ]);
  expect(onComplete).toHaveBeenCalledTimes(2);
});

it("excludes conflicts already overwritten individually", async () => {
  await act(async () => button("skillGroupActions.forceOverride").click());
  await act(async () => button("skillGroupActions.forceOverrideAll").click());
  expect(onForceSync.mock.calls).toEqual([
    ["browser", "hermes"],
    ["reviewer", "hermes"],
    ["writer", "hermes"],
  ]);
});

it("reports refresh failures and releases the busy state without repeating successful writes", async () => {
  onComplete.mockRejectedValueOnce(new Error("Refresh failed"));
  await act(async () => button("skillGroupActions.forceOverrideAll").click());
  expect(toast.error).toHaveBeenCalledWith("Refresh failed");
  expect(button("common.confirm").disabled).toBe(false);
  expect(container.textContent).not.toContain(
    "skillGroupActions.forceOverride",
  );
  expect(
    container.textContent?.match(/skillGroupActions.overridden/g),
  ).toHaveLength(3);
});
