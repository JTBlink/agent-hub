// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../../../i18n/zh.json";
import type { AutomationDraft } from "../../../lib/tauri";
import { AutomationHerdrFields } from "./AutomationHerdrFields";

const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
const draft: AutomationDraft = {
  name: "项目巡检",
  provider: "system",
  content: "sh './run.sh'",
  workdir: null,
  schedule: { kind: "hourly", minute: 15 },
  enabled: true,
  files: [
    { path: "task/prompt.md", content: "检查项目。" },
    {
      path: "config/agent.json",
      content: JSON.stringify({
        runner: { kind: "codex", session: "default", title: "巡检" },
        launch: { arguments: ["--dangerously-bypass-approvals-and-sandbox"] },
        execution: { wait_timeout_seconds: 1800 },
      }),
    },
  ],
};
let root: Root;
let container: HTMLDivElement;
const changed = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  changed.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function Fields({ initial = draft }: { initial?: AutomationDraft }) {
  const [value, setValue] = useState(initial);
  return (
    <AutomationHerdrFields
      draft={value}
      disabled={false}
      onChange={(update) => {
        changed(update);
        setValue((previous) => ({ ...previous, ...update }));
      }}
    />
  );
}
async function input(label: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(field),
      "value",
    )?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
it("saves extra argument text and session together while preserving defaults and task files", async () => {
  await act(async () => root.render(<Fields />));
  const text = '-m model-id\n-c\nname="value with spaces"';
  await input("额外的智能体参数", text);
  await input("Herdr 会话", "scheduled");
  const files = changed.mock.lastCall![0].files;
  expect(JSON.parse(files[1].content)).toEqual({
    runner: { kind: "codex", session: "scheduled", title: "巡检" },
    launch: {
      arguments: ["-m model-id", "-c", 'name="value with spaces"'],
    },
    execution: { wait_timeout_seconds: 1800 },
  });
  expect(files[0]).toEqual(draft.files![0]);
  expect(container.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(
    text,
  );
  expect(
    container.querySelector("textarea")!.getAttribute("aria-describedby"),
  ).toBe(container.querySelector("span[id]")!.id);
});
it("reflects edits from the script file and prevents input while saving", async () => {
  await act(async () =>
    root.render(
      <AutomationHerdrFields
        draft={draft}
        disabled={false}
        onChange={changed}
      />,
    ),
  );
  const updated = {
    ...draft,
    files: [
      draft.files![0],
      {
        ...draft.files![1],
        content: JSON.stringify({
          runner: { kind: "codex", session: "other", title: "巡检" },
          launch: { arguments: ["--model another-model"] },
          execution: { wait_timeout_seconds: 1800 },
        }),
      },
    ],
  };
  await act(async () =>
    root.render(
      <AutomationHerdrFields draft={updated} disabled onChange={changed} />,
    ),
  );
  expect(container.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(
    "--model another-model",
  );
  expect(
    container.querySelector<HTMLTextAreaElement>("textarea")!.disabled,
  ).toBe(true);
  expect(container.querySelector<HTMLInputElement>("input")!.value).toBe(
    "other",
  );
  expect(container.querySelector<HTMLInputElement>("input")!.disabled).toBe(
    true,
  );
  expect(changed).not.toHaveBeenCalled();
});
it("preserves script-owned variables when changing the wait timeout", async () => {
  const config = JSON.parse(draft.files![1].content);
  config.execution.include_task_variables = false;
  await act(async () =>
    root.render(
      <Fields
        initial={{
          ...draft,
          files: [
            draft.files![0],
            { ...draft.files![1], content: JSON.stringify(config) },
          ],
        }}
      />,
    ),
  );
  await input("Agent 等待期限（秒）", "3600");
  expect(
    JSON.parse(changed.mock.lastCall![0].files[1].content).execution,
  ).toEqual({
    wait_timeout_seconds: 3600,
    include_task_variables: false,
  });
});
it("does not offer agent arguments for a shell task", async () => {
  await act(async () =>
    root.render(
      <AutomationHerdrFields
        draft={{ ...draft, files: [] }}
        disabled={false}
        onChange={changed}
      />,
    ),
  );
  expect(container.childElementCount).toBe(0);
});
