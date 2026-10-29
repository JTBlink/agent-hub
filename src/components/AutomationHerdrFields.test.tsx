// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import zh from "../i18n/zh.json";
import type { AutomationDraft } from "../lib/tauri";
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
      path: "task/herdr.json",
      content: JSON.stringify({
        agent: "codex",
        session: "default",
        arguments: ["--dangerously-bypass-approvals-and-sandbox"],
        title: "巡检",
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
function Fields() {
  const [value, setValue] = useState(draft);
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
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("saves extra argument text and session together while preserving defaults and task files", async () => {
  await act(async () => root.render(<Fields />));
  const text = "-m model-id -c 'name=\"value with spaces\"'";
  await input("额外的智能体参数", text);
  await input("Herdr 会话", "scheduled");
  const files = changed.mock.lastCall![0].files;
  expect(JSON.parse(files[1].content)).toEqual({
    agent: "codex",
    session: "scheduled",
    title: "巡检",
    arguments: ["--dangerously-bypass-approvals-and-sandbox"],
    extra_arguments: text,
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
          agent: "codex",
          session: "other",
          extra_arguments: "--model another-model",
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
