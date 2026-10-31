// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import { codeEditor, installCodeEditorGeometry } from "../test/codeEditor";
import zh from "../i18n/zh.json";
import { AutomationScriptFilesEditor } from "./AutomationScriptFilesEditor";

const i18n = createInstance();
await i18n.init({
  lng: "zh",
  interpolation: { escapeValue: false },
  resources: { zh: { translation: zh } },
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  },
  close: {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  },
});
let container: HTMLDivElement;
let root: Root;
const initial = [
  { path: "maintenance/agent.py", content: "print('check')" },
  { path: "maintenance/herdr.json", content: '{"agent":"codex"}' },
  { path: "run.sh", content: "python3 maintenance/agent.py" },
];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  installCodeEditorGeometry();
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
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${path}"]`,
  );
  expect(button).not.toBeNull();
  await act(async () => button!.click());
}
async function openReader() {
  const button = [...container.querySelectorAll("button")].find((node) =>
    node.textContent?.includes("打开文件阅读器"),
  )!;
  button.focus();
  await act(async () => button.click());
  return button;
}
it("opens a separate reader and keeps edits across file switches and reopening", async () => {
  await act(async () => root.render(<Editor />));
  expect(container.querySelector("textarea")).toBeNull();
  const trigger = await openReader();
  expect(document.querySelector("dialog[open]")).not.toBeNull();
  await click("maintenance/agent.py");
  const editor = codeEditor(document);
  expect(editor.state.sliceDoc()).toBe("print('check')");
  await act(async () => {
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: "print('updated')",
      },
    });
  });
  await click("maintenance/herdr.json");
  expect(codeEditor(document).state.sliceDoc()).toBe('{"agent":"codex"}');
  await click("maintenance/agent.py");
  expect(codeEditor(document).state.sliceDoc()).toBe("print('updated')");
  await click("关闭");
  expect(document.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await openReader();
  expect(codeEditor(document).state.sliceDoc()).toBe("print('updated')");
});
it("allows reading and selecting text while busy and handles removed files", async () => {
  await act(async () =>
    root.render(
      <AutomationScriptFilesEditor
        files={initial}
        disabled
        onChange={() => {}}
      />,
    ),
  );
  await openReader();
  await click("run.sh");
  const editor = codeEditor(document);
  expect(editor.state.readOnly).toBe(true);
  expect(editor.contentDOM.getAttribute("tabindex")).toBe("0");
  await act(async () =>
    root.render(
      <AutomationScriptFilesEditor
        files={[initial[0]]}
        disabled={false}
        onChange={() => {}}
      />,
    ),
  );
  expect(document.querySelector("dialog .cm-editor")).toBeNull();
  await click("maintenance/agent.py");
  expect(codeEditor(document).state.readOnly).toBe(false);
});
