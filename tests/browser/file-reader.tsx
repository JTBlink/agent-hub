import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  FileReaderDialog,
  type ReaderFile,
} from "../../src/components/file-reader";
import { i18nReady } from "../../src/i18n";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/index.css";

// Synthetic data only: exercise the reusable reader without Tauri or disk access.
const params = new URLSearchParams(location.search);
await i18nReady;
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
applyTextSize(params.get("size") ?? "default");
export function Preview() {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<ReaderFile[]>([
    {
      path: "demo/README.md",
      content:
        '# 文件阅读器\n\n在左侧选择文件，在右侧阅读或编辑。\n\n## 配置示例\n\n```json\n{"enabled": true}\n```\n\n| 功能 | 支持 |\n| --- | --- |\n| 文件切换 | ✓ |\n| 源码编辑 | ✓ |\n\n**更改保留在示例草稿中。**',
    },
    {
      path: "demo/maintenance.py",
      content: Array.from(
        { length: 180 },
        (_, i) =>
          `print("Example line ${i + 1}: ${"readable text ".repeat(10)}")`,
      ).join("\n"),
    },
    {
      path: "demo/settings.json",
      content: '{\n  "enabled": true,\n  "retention_days": 30\n}\n',
    },
    { path: "other/settings.json", content: '{"enabled": false}' },
    {
      path: "目录名称较长用于验证文件名截断和目录滚动/very-long-file-name-for-reader-layout-validation.txt",
      content: "Example text\n",
    },
    { path: "run.sh", content: "#!/bin/sh\npython3 demo/maintenance.py\n" },
  ]);
  return (
    <div className="p-8">
      <button className="app-button-primary" onClick={() => setOpen(true)}>
        打开文件阅读器
      </button>
      {open && (
        <FileReaderDialog
          files={files}
          description="示例数据：更改保留在草稿中。"
          onClose={() => setOpen(false)}
          onContentChange={
            params.has("readonly")
              ? undefined
              : (path, content) =>
                  setFiles((previous) =>
                    previous.map((file) =>
                      file.path === path ? { ...file, content } : file,
                    ),
                  )
          }
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
