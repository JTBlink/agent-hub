// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { makeRepositoryTask } from "../../../tests/fixtures/repositoryTask";
import { TaskIssueStatus } from "./TaskIssueStatus";
import { TaskCommentComposer } from "./TaskCommentComposer";
import { TaskRowActions } from "./TaskRowActions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(invoke).mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const render = async (node: ReactNode) => act(async () => root.render(node));
async function click(label: string) {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (button) =>
      button.textContent === label ||
      button.getAttribute("aria-label") === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
async function input(
  node: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(node),
      "value",
    )!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("writes GitHub close reasons and duplicate targets, blocks repeated submissions and retains failures", async () => {
  const task = makeRepositoryTask({
    kind: "issue",
    provider: "github",
    state: "open",
  });
  const updated = vi.fn();
  let resolve: (value: unknown) => void = () => {};
  vi.mocked(invoke).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await render(
    <TaskIssueStatus
      task={task}
      items={[
        task,
        { ...task, key: "other", number: 8, title: "Canonical issue" },
      ]}
      onUpdated={updated}
    />,
  );
  await click("tasks.changeState");
  await click("tasks.closeCompleted");
  expect(invoke).toHaveBeenCalledWith("task_update_issue", {
    bindingId: task.binding_id,
    number: task.number,
    change: { action: "completed" },
  });
  expect(
    host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.disabled,
  ).toBe(true);
  await act(async () => resolve({ ...task, state: "closed" }));
  expect(updated).toHaveBeenCalledOnce();
  vi.mocked(invoke).mockRejectedValue({
    kind: "permission",
    message: "Permission denied",
  });
  await click("tasks.changeState");
  await click("tasks.closeDuplicate");
  const target = document.querySelector<HTMLInputElement>(
    'input[aria-label="tasks.duplicateTarget"]',
  )!;
  await input(target, String(task.number));
  await act(async () =>
    target.form!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "tasks.duplicateTargetInvalid",
  );
  await input(target, "8");
  await click("#8 Canonical issue");
  expect(invoke).toHaveBeenLastCalledWith(
    "task_update_issue",
    expect.objectContaining({
      change: { action: "duplicate", duplicate_of: 8 },
    }),
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Permission denied",
  );
  expect(updated).toHaveBeenCalledOnce();
});

it("offers only supported GitLab state actions", async () => {
  const task = makeRepositoryTask({
    kind: "issue",
    provider: "gitlab",
    state: "opened",
  });
  vi.mocked(invoke).mockResolvedValue({ ...task, state: "closed" });
  await render(<TaskIssueStatus task={task} onUpdated={vi.fn()} />);
  await click("tasks.changeState");
  expect(
    [...document.querySelectorAll('[role="menuitem"]')].map(
      (item) => item.textContent,
    ),
  ).toEqual(["tasks.open", "tasks.closed"]);
  await click("tasks.closed");
  expect(invoke).toHaveBeenCalledWith(
    "task_update_issue",
    expect.objectContaining({ change: { action: "closed" } }),
  );
});

it.each(["github", "gitlab"] as const)(
  "keeps a failed %s comment draft and appends the confirmed retry",
  async (provider) => {
    const task = makeRepositoryTask({ kind: "issue", provider });
    const created = vi.fn();
    vi.mocked(invoke)
      .mockRejectedValueOnce({
        kind: "permission",
        message: "Permission denied",
      })
      .mockResolvedValueOnce({
        id: 12,
        author: "contributor",
        body: "**Review**",
      });
    await render(<TaskCommentComposer task={task} onCreated={created} />);
    expect(
      host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled,
    ).toBe(true);
    const textarea = host.querySelector("textarea")!;
    await input(textarea, "**Review**");
    await click("tasks.sendComment");
    expect(textarea.value).toBe("**Review**");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Permission denied",
    );
    await click("tasks.sendComment");
    expect(invoke).toHaveBeenLastCalledWith("task_add_comment", {
      bindingId: task.binding_id,
      kind: "issue",
      number: task.number,
      body: "**Review**",
    });
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }));
    expect(textarea.value).toBe("");
  },
);

it.each(["github", "gitlab"] as const)(
  "opens the %s issue in the browser and requests its task launch dialog",
  async (provider) => {
    const task = makeRepositoryTask({ provider });
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === "task_detail"
        ? {
            summary: task,
            body: "Acceptance criteria",
            comments: [],
            has_more_comments: false,
          }
        : undefined,
    );
    const start = vi.fn();
    await render(
      <TaskRowActions
        task={task}
        canStart
        onPreview={vi.fn()}
        onStart={start}
      />,
    );
    await click("tasks.moreActions");
    await click("tasks.openInBrowser");
    expect(openUrl).toHaveBeenCalledWith(task.url);
    await click("tasks.start");
    expect(start).toHaveBeenCalledOnce();
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some(([command]) => command === "terminal_write"),
    ).toBe(false);
  },
);
