// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import zh from "../../i18n/zh.json";
import { FileReader, type ReaderFile } from ".";

const i18n = createInstance();
await i18n.init({
  lng: "zh",
  interpolation: { escapeValue: false },
  resources: { zh: { translation: zh } },
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));
let container: HTMLDivElement;
let root: Root;
const files: ReaderFile[] = [
  {
    path: "docs/README.md",
    content:
      "# Example\n\n**Hello**\n\n<script>alert(1)</script>\n\n![private](https://example.invalid/image.png)",
  },
  { path: "src/run.py", content: "print('hello')\n" },
  { path: "other/run.py", content: "print('other')" },
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
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (node) => (node.getAttribute("aria-label") ?? node.textContent) === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
function Editable() {
  const [values, setValues] = useState(files);
  return (
    <FileReader
      files={values}
      onContentChange={(path, content) =>
        setValues((previous) =>
          previous.map((file) =>
            file.path === path ? { ...file, content } : file,
          ),
        )
      }
    />
  );
}
it("previews Markdown and edits its source without losing changes across duplicate basenames or tab closure", async () => {
  await act(async () => root.render(<Editable />));
  expect(container.querySelector("article h1")!.textContent).toBe("Example");
  expect(container.querySelector("article strong")!.textContent).toBe("Hello");
  expect(container.querySelector("article script")).toBeNull();
  expect(container.querySelector("article img")).toBeNull();
  await click("源码");
  const editor = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(editor, "# Updated");
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("src/run.py");
  expect(container.querySelector("textarea")!.value).toBe("print('hello')\n");
  await click("other/run.py");
  expect(container.querySelector("textarea")!.value).toBe("print('other')");
  await click("切换到 docs/README.md");
  expect(container.querySelector("article h1")!.textContent).toBe("Updated");
  await click("关闭 docs/README.md");
  await click("docs/README.md");
  expect(container.querySelector("article h1")!.textContent).toBe("Updated");
});
it("supports read-only source, wrapping and a collapsible explorer", async () => {
  await act(async () =>
    root.render(<FileReader files={files} initialPath="src/run.py" />),
  );
  expect(container.querySelector("textarea")!.readOnly).toBe(true);
  expect(container.querySelector("textarea")!.disabled).toBe(false);
  expect(container.querySelector("textarea")!.wrap).toBe("off");
  await click("自动换行");
  expect(container.querySelector("textarea")!.wrap).toBe("soft");
  await click("显示或隐藏文件目录");
  expect(container.querySelector("aside")!.hidden).toBe(true);
  await click("显示或隐藏文件目录");
  expect(container.querySelector("aside")!.hidden).toBe(false);
});
it("closes tabs without deleting files and recovers from empty or replaced inputs", async () => {
  await act(async () => root.render(<FileReader files={files} />));
  await click("关闭 docs/README.md");
  expect(container.querySelector("article")).toBeNull();
  expect(container.querySelector('[role="status"]')!.textContent).toContain(
    "选择文件",
  );
  await click("src/run.py");
  await act(async () => root.render(<FileReader files={[]} />));
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.querySelector('[role="status"]')!.textContent).toContain(
    "暂无文件",
  );
  await act(async () => root.render(<FileReader files={[files[2]]} />));
  await click("other/run.py");
  expect(container.querySelector("textarea")!.value).toBe("print('other')");
});

it("opens the current file in VS Code without changing its draft", async () => {
  const open = vi.fn().mockResolvedValue(undefined);
  const change = vi.fn();
  await act(async () =>
    root.render(
      <FileReader
        files={files}
        onOpenInVscode={open}
        onContentChange={change}
      />,
    ),
  );
  await click("在 VS Code 中打开");
  expect(open).toHaveBeenLastCalledWith("docs/README.md");
  await click("other/run.py");
  await click("在 VS Code 中打开");
  expect(open).toHaveBeenLastCalledWith("other/run.py");
  expect(change).not.toHaveBeenCalled();
});

it("disables VS Code opening without a local file callback", async () => {
  await act(async () => root.render(<FileReader files={files} />));
  const button = container.querySelector<HTMLButtonElement>(
    '[aria-label="在 VS Code 中打开"]',
  )!;
  expect(button.disabled).toBe(true);
  expect(button.title).toBe("此文件尚无可打开的本地路径");
});

it("prevents duplicate opening requests and supports retry after failure", async () => {
  let reject: (cause: Error) => void = () => {};
  const open = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      <FileReader
        files={files}
        initialPath="src/run.py"
        onOpenInVscode={open}
      />,
    ),
  );
  await click("在 VS Code 中打开");
  expect(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="在 VS Code 中打开"]',
    )!.disabled,
  ).toBe(true);
  await click("在 VS Code 中打开");
  expect(open).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("VS Code unavailable")));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "VS Code unavailable",
  );
  expect(container.querySelector("textarea")!.value).toBe(files[1].content);
  await click("在 VS Code 中打开");
  expect(open).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("keeps an earlier file's opening failure out of the newly selected file", async () => {
  let reject: (cause: Error) => void = () => {};
  const open = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  await act(async () =>
    root.render(<FileReader files={files} onOpenInVscode={open} />),
  );
  await click("在 VS Code 中打开");
  await click("src/run.py");
  await act(async () => reject(new Error("Old file failed")));
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="在 VS Code 中打开"]',
    )!.disabled,
  ).toBe(false);
});
