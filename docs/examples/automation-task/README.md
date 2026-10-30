# Git 自动化任务包示例

这是 macOS / Linux 可识别的最小目录任务包，Git 安装页直接展示同一份 `task.json` 与脚本。

```text
repository/
└── automations/
    └── example-task/
        ├── task.json
        └── scripts/
            └── run.sh
```

将本目录复制到仓库的 `automations/example-task/` 后提交即可。也可将任务放在仓库根目录，或使用 GitHub `https://github.com/example-org/automation-tasks/tree/main/automations/example-task` 这类目录链接选择单个任务。

Git 安装识别的是文件名为 `task.json` 的目录任务包。普通脚本、README、`SKILL.md` 和任意名称的导出 JSON 不会独立构成 Git 任务入口。导出的单文件 JSON 请使用「本地安装 → 选择 JSON 文件」。

## 识别与读取规则

- 所选目录包含 `task.json` 时从该目录扫描。否则，若有 `automations/`，仅扫描该子目录；没有时从所选目录扫描。
- 扫描最多 6 层（包括 `task.json` 文件名），跳过隐藏目录、`skills`、`node_modules`、`target`、`dist`、`vendor`，不跟随符号链接。最多访问 4096 个条目、识别 100 个有效或无效任务；过大的仓库应通过 GitHub 目录链接缩小范围。
- 支持 HTTPS、HTTP、SSH 与 `git@` 仓库地址；`example-org/automation-tasks` 简写按 GitHub 仓库解析。目录 `tree` 链接目前仅解析 GitHub，其他 Git 服务使用可克隆的仓库地址。
- 分支或标签留空时：普通仓库使用默认分支，GitHub 目录链接使用链接中的版本。手填分支或标签优先于链接版本；预览后安装使用已固定 commit 的快照。
- `schema_version` 必须为 `1`，`shell` 必须与本机一致：macOS / Linux 为 `sh`，Windows 为 `powershell`。Windows 示例应同时改用 `scripts/run.ps1` 及 `"content": "& './scripts/run.ps1'"`。
- 顶层 `files` 是相对当前 `task.json` 的文件路径列表，声明的文件必须存在。脚本和配置放在 `scripts/`，也可声明根目录的 `README.md`、`prompt.md`、`herdr.json`。可选文件同样需列入 `files` 才会导入；`draft.files` 应省略或为空。
- 文件扩展名目前支持 `.py`、`.sh`、`.ps1`、`.json`、`.md`；内容须为非空 UTF-8。每个任务最多 32 个文件，命令与文件内容合计不超过 64 KiB；相对路径不能越界，不支持链接文件。
- `draft.workdir` / `draft.script_dir` 省略或为 `null`，本机项目目录在安装时选择。依赖放在顶层 `dependencies`，不在 `draft.package_options` 重复声明；本机 `.local/` 不属于共享内容。

`README.md`、提示词和智能体配置是可选内容，本示例不需要额外依赖。预览会读取定义与声明的文件，不执行脚本；安装默认保持暂停。
