# 文件阅读器

`FileReader` 是可嵌入的文本文件阅读区，`FileReaderDialog` 提供应用内模态阅读窗口。模块不依赖自动化、技能、Tauri 或文件系统。两种入口共用目录树、标签页、Markdown 预览和源码编辑。

```tsx
import { FileReaderDialog, type ReaderFile } from "./file-reader";

const files: ReaderFile[] = [{ path: "docs/README.md", content: "# Example" }];

<FileReaderDialog
  files={files}
  initialPath="docs/README.md"
  onClose={closeReader}
/>;
```

- `files`：受控的 UTF-8 文本内容，`path` 是当前阅读器内唯一的文件标识，使用 `/` 分隔目录。
- `initialPath`：挂载时选择的文件，默认选择首个文件。更换整个文件集合时，调用方可用 React `key` 开启新的阅读会话。
- `onContentChange(path, content)`：可选；省略时只读，传入时由调用方立即更新 `files`。模块不另存一份草稿，不自行落盘或决定保存时机。
- `maxLength`：可选，由接入方按存储限制提供。
- `onOpenInVscode(path)`：可选异步回调，打开当前文件的本地版本；接入方解析真实路径并启动 VS Code。未提供时工具栏入口禁用，提示文件尚无本地路径。阅读器提供等待、失败与重试反馈，不自动保存草稿；切换文件后旧请求不会覆盖新文件状态。
- `openInVscodeHint`：可选，覆盖外部编辑器提示并在状态栏显示。发现页通过接入方生成当前预览的临时副本，VS Code 中的修改不写回任务；副本在应用退出时清理，已保存任务继续打开原文件。
- 弹窗额外支持 `title`、`description` 和 `onClose`；挂载即打开，关闭后由调用方卸载。`description` 可说明业务保存方式。

接入方负责读取、加载、错误反馈及保存。原生 `dialog` 管理焦点、背景不可操作和 Escape 取消；若父弹窗监听全局键盘事件，应跳过目标位于 `dialog[open]` 内的事件。点击背景不关闭，避免意外中断阅读。

源码阅读与编辑共用 CodeMirror 6，语言按文件扩展名从本地打包资源加载，支持 Python、Shell、PowerShell、JSON、YAML、TOML、JS/TS、Rust 和 Markdown；未知类型显示纯文本。行号、换行、选择复制和撤销由编辑器统一处理，配色引用应用明暗主题 token。宿主仍持有草稿并决定保存时机和长度限制。

Markdown 预览复用通用 `MarkdownContent`，其中的代码块暂不高亮。此文本接口不加载图片，也不解析附件或相对链接；不提供二进制文件查看或操作系统级独立窗口。
