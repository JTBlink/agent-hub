# GitHub OAuth App 配置与维护流程

本文记录 agent-hub 的 OAuth App 注册、网页品牌更新、代码同步和验证流程。当前使用 GitHub Device Flow，应用名称和 Logo 由 GitHub 注册信息决定，本地翻译无法修改 GitHub 授权页的品牌。

## 当前配置

| 项目                       | 内容                                                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 应用设置页                 | [OAuth App 设置](https://github.com/settings/applications/3912101)                                                                                                           |
| Application name           | `agent-hub`                                                                                                                                                                  |
| Homepage URL               | 与 `src/lib/distribution.ts` 中的 `PROJECT_URL` 一致                                                                                                                         |
| Application description    | AgentHub is a desktop workspace for organizing AI agent skills, managing skill groups, deploying skills across agents and projects, and syncing private backups with GitHub. |
| Application logo           | [项目 256×256 PNG 图标](../../src-tauri/icons/128x128@2x.png)                                                                                                                |
| Authorization callback URL | 与项目主页一致；Device Flow 不使用此回调                                                                                                                                     |
| Allow wildcard matching    | 不勾选                                                                                                                                                                       |
| Enable Device Flow         | 勾选                                                                                                                                                                         |
| 公共 Client ID             | `Ov23liuxI32ZuqaZKBbt`                                                                                                                                                       |
| 请求权限                   | `repo`，用于私有备份仓库                                                                                                                                                     |

Client ID 是公开标识，可以随源码发布。Client Secret、访问令牌、设备码和个人账户信息不得写入文档、日志或提交。本流程无需生成 Client Secret，令牌交换与本地凭据存储由 Rust 端完成。

## 1. 确认旧应用与本项目应用的区别

1. 检查 [前端元数据](../../src/lib/distribution.ts) 和 [Rust GitHub 客户端](../../src-tauri/src/core/github_api.rs) 使用的 Client ID。
2. 使用已登录的浏览器打开 [OAuth Apps](https://github.com/settings/developers)，确认本项目应用已经存在。
3. 如果授权页显示上游应用名称，检查 Client ID 的归属；仅修改本地应用名或翻译不会改变 GitHub 授权页。
4. 如果当前账户无法管理旧应用，应为本项目注册独立应用，然后切换 Client ID。

## 2. 注册独立 OAuth App

本项目应用已注册，日常维护直接使用上表设置页，避免重复创建。

首次注册时，打开 [New OAuth App](https://github.com/settings/applications/new)，填写应用名、项目主页、介绍和固定回调地址，开启 Device Flow，保持通配符匹配关闭，再点击 **Register application**。记录生成的公共 Client ID，并确认应用设置页显示正确名称。

Device Flow 的设置要求与授权步骤见 [GitHub 官方说明](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)。

## 3. 使用 browser-use 更新名称、介绍和 Logo

1. 使用 `browser-use` 复用现有 GitHub 设置标签页；不要另开重复页面，也不要切换到不相关标签页。
2. 通过页面无障碍树定位 **Application name**、**Application description**、**Upload new logo** 和 **Update application**。
3. 将名称设为 `agent-hub`，介绍填写上表内容。覆盖文本后读取字段值，确认没有与原内容拼接。
4. 上传 `src-tauri/icons/128x128@2x.png`，该文件为项目现有的 256×256 品牌图标。
5. 在 **Crop your new application logo** 对话框中确认裁切，点击 **Set new application logo**。
6. 确认 Device Flow 已勾选、固定回调正确且通配符未勾选，点击 **Update application**。
7. GitHub 可能返回 OAuth Apps 列表。重新打开应用设置页，核实名称、介绍、Logo 和复选框状态，确保改动已持久化。

文件上传可通过 CDP 直接指定仓库图标，免去操作系统文件选择器：

```bash
browser-use <<'PY'
from pathlib import Path

root = cdp('DOM.getDocument')['root']['nodeId']
node = cdp('DOM.querySelector', nodeId=root, selector='#upload-app-logo')['nodeId']
cdp('DOM.setFileInputFiles', nodeId=node,
    files=[str(Path('src-tauri/icons/128x128@2x.png').resolve())])
PY
```

从仓库根目录执行，并先确认 browser-use 当前连接的是应用设置页。上传后仍需在网页中确认裁切和保存。浏览器处于导航过程中时，等待页面完成后重新定位元素；不要使用上一次页面的节点编号。

## 4. 同步前端和 Rust Client ID

修改以下两个公开常量，使其与 GitHub 新应用一致：

- `src/lib/distribution.ts`：`GITHUB_OAUTH_CLIENT_ID`，用于打开当前应用的 GitHub 授权管理页面。
- `src-tauri/src/core/github_api.rs`：`OAUTH_CLIENT_ID`，用于申请设备码和轮询授权结果。

备份页默认展示 **使用 GitHub 登录**，保留个人访问令牌入口。重新编译并启动桌面应用后，新的 Rust Client ID 才会用于设备授权；仅刷新网页无法更新已运行的 Rust 进程。

Rust 回归测试 `device_flow_and_frontend_settings_use_the_same_oauth_app` 检查两个常量保持一致，避免登录与撤销授权指向不同应用。

## 5. 验证授权入口

1. 使用新 Client ID 和 `scope=repo` 请求 `POST https://github.com/login/device/code`，设置 `Accept: application/json`。
2. 确认 HTTP 200，并且响应包含设备码、用户码、`verification_uri`、有效期和轮询间隔。检查结果时只输出字段是否存在，不输出码值或令牌。
3. 从重建后的桌面应用进入备份页，点击 **使用 GitHub 登录**，按页面提示在 GitHub 输入设备码。
4. 在授权页确认应用名称与 Logo；用户批准后，应用继续轮询并连接私有备份仓库。遵守响应给出的轮询间隔。
5. 断开连接时，应用内授权管理链接应指向当前 OAuth App。已授权旧应用的账户需要重新登录本项目应用，旧应用授权可在 GitHub 设置中单独撤销。

本次网页与接口验证完成于 2026-10-07：设置页重新打开后显示新图标、完整介绍及正确 Client ID；设备码接口 HTTP 200，返回有效代码和 GitHub 验证地址。这验证了应用注册和设备授权入口，尚未代替重建桌面应用后的完整登录、钥匙串及备份创建验收。

## 6. 运行检查并提交

```bash
npm run build
npm run lint
npm test -- --run
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tasks:check
git diff --check
```

更新 CHANGELOG 与 [B15 任务记录](../../.scratch/skills-manager-integration/issues/B15-github-oauth-branding.md)，同步任务索引并进行 Standards / Spec 审查。提交前检查新增内容是否包含个人身份信息或凭证，采用 [中文提交规范](commit-conventions.md) 生成本地提交。

## 本地凭据缓存与 macOS 授权

凭据默认保存在 `~/.agent-hub/credentials/`，自定义应用数据目录与 CLI 显式 Skills 根使用各自隔离的数据目录。主机名哈希作为文件名，内容为本地凭据；Unix 目录 0700、文件 0600，通过临时文件原子替换。Windows 继承用户目录 ACL。文件权限保护不等于加密，请勿将该目录加入共享或备份。Git 备份排除该目录。

同一进程内复用凭据，不反复读文件；新进程先读本地记录。仅在没有记录时读取旧 `agent-hub-git-backup` 钥匙串项，成功后写入本地。首次迁移仍可能弹出系统授权；取消后本进程不反复询问，也可直接重新登录保存新凭据。退出写入空记录，防止旧钥匙串凭据重新生效。登录/令牌轮换立即刷新内存和文件。

备份页提供“优先使用 GitHub CLI（gh）”开关，默认开启，保存于本机数据库的 `backup_use_gh`，桌面与 CLI 重启后保留。关闭后跳过 gh 登录查询；修改后下一次凭据解析生效，SSH 不受影响。

开关开启时，GitHub HTTPS 备份优先通过已安装的 `gh auth token --hostname github.com` 读取当前登录，不额外保存这份令牌。`gh` 是可选依赖；未安装、未登录或无法读取令牌时，回退到 AgentHub 保存的设备授权或个人访问令牌。其他 Git 主机不查询 `gh`，SSH 保留密钥认证。该选择同时用于系统 Git 和 libgit2；应用内仓库列表等 GitHub API 功能仍使用应用授权。

取得凭据后，单次 Git 子进程替换系统 credential helper，使用仅响应目标主机的非交互 helper，通过子进程环境传递凭据，避免再次访问系统 helper 或依赖 askpass。即使 `credential.interactive=false` 也能工作；不修改全局 Git 配置、不把令牌写入命令参数或 helper 文件。没有可用凭据时保留普通 Git 的既有配置。

如果 GitHub 返回 `Invalid username or token`，先确认当前凭据来源：使用 `gh` 时通过 `gh auth status` 检查并更新 CLI 登录；使用应用凭据时通过备份页“重新连接 GitHub”重新授权。缓存不能修复失效或已撤销令牌。开发模式 Rust 文件变化会触发应用重启，授权期间应暂停修改，或使用 `npm run tauri dev -- --no-watch` 启动稳定的验证会话。

回归测试只使用临时文件、假凭据和 mock 钥匙串，覆盖跨会话读取、退出、更新、文件权限及 Git helper 绕过。
