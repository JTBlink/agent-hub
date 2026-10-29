// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import zh from "../i18n/zh.json";
import { AutomationScriptFilesEditor } from "./AutomationScriptFilesEditor";

const i18n = createInstance();
await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
let container: HTMLDivElement;
let root: Root;
const initial = [
  { path: "maintenance/agent.py", content: "print('check')" },
  { path: "maintenance/herdr.json", content: '{"agent":"codex"}' },
  { path: "run.sh", content: "python3 maintenance/agent.py" },
];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function Editor({ disabled = false }) {
  const [files, setFiles] = useState(initial);
  return (
    <AutomationScriptFilesEditor
      files={files}
      disabled={disabled}
      onChange={setFiles}
    />
  );
}
async function click(path: string) {
  const button = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${path}"]`,
  );
  expect(button).not.toBeNull();
  await act(async () => button!.click());
}
it("shows a compact directory tree and edits only the selected file without losing edits", async () => {
  await act(async () => root.render(<Editor />));
  const panel = container.querySelector("details")!;
  await act(async () => {
    panel.open = true;
  });
  expect(container.querySelector("textarea")).toBeNull();
  expect(
    [...container.querySelectorAll("summary")].map((node) => node.textContent),
  ).toContain("maintenance");
  await click("maintenance/agent.py");
  const editor = container.querySelector("textarea")!;
  expect(editor.value).toBe("print('check')");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(editor, "print('updated')");
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("maintenance/herdr.json");
  expect(container.querySelectorAll("textarea")).toHaveLength(1);
  expect(container.querySelector("textarea")!.value).toBe('{"agent":"codex"}');
  await click("maintenance/agent.py");
  expect(container.querySelector("textarea")!.value).toBe("print('updated')");
  await click("关闭文件预览");
  expect(container.querySelector("textarea")).toBeNull();
});
it("allows viewing files while busy but prevents editing and clears missing selections", async () => {
  await act(async () => root.render(<Editor disabled />));
  await click("run.sh");
  expect(container.querySelector("textarea")!.disabled).toBe(true);
  await act(async () =>
    root.render(
      <AutomationScriptFilesEditor
        files={[initial[0]]}
        disabled={false}
        onChange={() => {}}
      />,
    ),
  );
  expect(container.querySelector("textarea")).toBeNull();
});
