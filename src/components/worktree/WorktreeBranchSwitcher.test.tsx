// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorktreeBranchSwitcher } from "./WorktreeBranchSwitcher";
import { getProjectGitReferences, runProjectGitAction } from "../../lib/gitApi";

const translate = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock("../../lib/gitApi", () => ({
  getProjectGitReferences: vi.fn(),
  runProjectGitAction: vi.fn(),
}));
let host: HTMLDivElement;
let root: Root;
const trigger = () =>
  host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
const item = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (button) => button.textContent === label,
  )!;
async function key(element: Element, key: string) {
  await act(async () =>
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
  );
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.mocked(getProjectGitReferences)
    .mockReset()
    .mockResolvedValue({
      entries: [
        { kind: "branches", name: "main", sha: "base" },
        { kind: "branches", name: "topic", sha: "next" },
        { kind: "tags", name: "v1", sha: "base" },
      ],
      truncated: false,
    });
  vi.mocked(runProjectGitAction).mockReset().mockResolvedValue();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <WorktreeBranchSwitcher
        projectId="demo"
        worktreePath="<workspace>/demo"
        branch="main"
        label="main"
        disabled={false}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("switches the selected checkout immediately without a dialog and blocks duplicate requests", async () => {
  await act(async () => trigger().click());
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  expect(item("main").disabled).toBe(true);
  expect(item("v1")).toBeUndefined();
  let finish!: () => void;
  vi.mocked(runProjectGitAction).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => item("topic").click());
  expect(runProjectGitAction).toHaveBeenCalledExactlyOnceWith(
    "demo",
    "<workspace>/demo",
    "switch_branch",
    "topic",
  );
  expect(trigger().disabled).toBe(true);
  await act(async () => trigger().click());
  expect(runProjectGitAction).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(trigger().disabled).toBe(false);
});

it("cancels keyboard selection and outside clicks without switching", async () => {
  await key(trigger(), "ArrowDown");
  await key(document.activeElement!, "End");
  expect(document.activeElement).toBe(item("topic"));
  await key(document.activeElement!, "Escape");
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
  await act(async () => trigger().click());
  await act(async () =>
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
  );
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(runProjectGitAction).not.toHaveBeenCalled();
});

it("keeps Git errors visible and allows selecting the branch again", async () => {
  vi.mocked(runProjectGitAction).mockRejectedValueOnce(
    new Error("Uncommitted changes would be overwritten"),
  );
  await act(async () => trigger().click());
  await act(async () => item("topic").click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Uncommitted changes would be overwritten",
  );
  await act(async () => trigger().click());
  await act(async () => item("topic").click());
  expect(runProjectGitAction).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("retries loading references in the same menu", async () => {
  vi.mocked(getProjectGitReferences).mockRejectedValueOnce(
    new Error("Read failed"),
  );
  await act(async () => trigger().click());
  await act(async () => item("Read failed · common.retry").click());
  expect(item("topic")).toBeDefined();
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
});

it("creates a branch from an inline name field and preserves the name on failure", async () => {
  await act(async () => trigger().click());
  await act(async () => item("git.actions.createBranch").click());
  const input = host.querySelector("input")!;
  expect(document.activeElement).toBe(input);
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  await key(input, "Enter");
  expect(runProjectGitAction).not.toHaveBeenCalled();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, " feature/new ");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  vi.mocked(runProjectGitAction).mockRejectedValueOnce(new Error("Try again"));
  await key(input, "Enter");
  expect(input.value).toBe(" feature/new ");
  await key(input, "Enter");
  expect(runProjectGitAction).toHaveBeenLastCalledWith(
    "demo",
    "<workspace>/demo",
    "create_branch",
    "feature/new",
  );
  expect(host.querySelector("input")).toBeNull();
});
