// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { getProjectGitRemotes, type GitRemote } from "../../lib/gitApi";
import { GitSourceControlToolbar } from "./GitSourceControlToolbar";

vi.mock("../../lib/gitApi", () => ({ getProjectGitRemotes: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const translate = (key: string, options?: { name: string }) =>
  options ? `${key} (${options.name})` : key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.mocked(writeText).mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(projectId = "demo") {
  return act(async () =>
    root.render(
      <GitSourceControlToolbar
        target={{ projectId, worktreePath: `<workspace>/${projectId}` }}
        disabled={false}
        canSync={false}
        canCommit={false}
        loading={false}
        tree
        history={false}
        graph={false}
        onGraph={vi.fn()}
        onRemote={vi.fn()}
        branchControl={null}
        onRefresh={vi.fn()}
        onTree={vi.fn()}
        onHistory={vi.fn()}
        onStageAll={vi.fn()}
        onUnstageAll={vi.fn()}
        canStage={false}
        canUnstage={false}
      />,
    ),
  );
}
function button(label: string) {
  const element = document.querySelector<HTMLButtonElement>(
    `button[title="${label}"]`,
  );
  if (!element) throw new Error(`Missing action: ${label}`);
  return element;
}
const open = () => act(async () => button("git.actions.more").click());

it("copies the current checkout's address on selection and reports clipboard failures", async () => {
  const url = "git@example.invalid:team/demo.git";
  vi.mocked(getProjectGitRemotes).mockResolvedValue([{ name: "origin", url }]);
  await render();
  expect(getProjectGitRemotes).not.toHaveBeenCalled();
  await open();
  expect(getProjectGitRemotes).toHaveBeenCalledWith("demo", "<workspace>/demo");
  expect(writeText).not.toHaveBeenCalled();
  button("git.actions.copyRemoteUrl").focus();
  await act(async () => button("git.actions.copyRemoteUrl").click());
  expect(writeText).toHaveBeenLastCalledWith(url);
  expect(toast.success).toHaveBeenCalledWith("git.referenceCopied");
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(button("git.actions.more"));
  vi.mocked(writeText).mockRejectedValueOnce(
    new Error("Clipboard unavailable"),
  );
  await open();
  await act(async () => button("git.actions.copyRemoteUrl").click());
  expect(toast.error).toHaveBeenCalledWith("Clipboard unavailable");
});

it("lets users choose a named remote, refreshes on reopening, and explains missing remotes", async () => {
  vi.mocked(getProjectGitRemotes).mockResolvedValue([
    { name: "origin", url: "https://example.invalid/fork.git" },
    { name: "upstream", url: "ssh://git@example.invalid/source.git" },
  ]);
  await render();
  await open();
  await act(async () =>
    button("git.actions.copyNamedRemoteUrl (upstream)").click(),
  );
  expect(writeText).toHaveBeenLastCalledWith(
    "ssh://git@example.invalid/source.git",
  );
  vi.mocked(getProjectGitRemotes).mockResolvedValue([]);
  await open();
  expect(button("git.actions.noRemotes").disabled).toBe(true);
  expect(
    document.querySelector('[title="git.actions.copyNamedRemoteUrl (origin)"]'),
  ).toBeNull();
});

it("retries failed reads and ignores old checkout responses after switching projects", async () => {
  vi.mocked(getProjectGitRemotes).mockRejectedValueOnce(
    new Error("Read failed"),
  );
  await render();
  await open();
  let finish: (remotes: GitRemote[]) => void = () => {};
  vi.mocked(getProjectGitRemotes).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => button("Read failed · common.retry").click());
  expect(button("git.actions.copyRemoteUrl").disabled).toBe(true);
  vi.mocked(getProjectGitRemotes).mockResolvedValue([
    { name: "origin", url: "https://example.invalid/second.git" },
  ]);
  await render("second");
  await act(async () =>
    finish([{ name: "old", url: "https://example.invalid/old.git" }]),
  );
  await act(async () => button("git.actions.copyRemoteUrl").click());
  expect(writeText).toHaveBeenLastCalledWith(
    "https://example.invalid/second.git",
  );
});
