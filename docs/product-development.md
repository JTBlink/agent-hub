# 产品配置与独立功能开发

本文说明如何为 AgentHub 增加编译期可选功能，以及如何配置产品。构建操作和产物位置见[编译、打包与安装](build-and-install.md)，整体组装方式见[应用组装边界](architecture/app-composition.md)。

编译能力与产品形态统一在 [`products/features.json`](../products/features.json) 管理。`features` 定义编译特性、前端实现／缺省入口和关联侧栏；`products` 为各产品选择能力。构建入口读取同一配置，向前端、桌面端和配套 CLI 传递同一特性集合与摘要。

`features.json` 是本项目的产品组装清单，不是 Cargo 内置配置文件。实际特性及依赖以 `src-tauri/Cargo.toml` 的 `[features]` 为准，清单沿用相同的 feature ID（例如 `cloud-sync`）。Tauri 的 `capabilities` 继续专指权限声明，二者分别维护。

## 配置一个产品

当前可选能力：

| 能力         | 编译范围                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `cloud-sync` | Git 备份、恢复、云端同步、设置与首次恢复入口、自动备份和退出备份；不影响技能部署、项目 Git、任务包本地导入导出 |
| `github`     | GitHub 任务查询、评审信息与写操作、CLI 凭据复用、GitHub 引导连接与应用更新检查                                 |
| `gitlab`     | GitLab 任务查询、评审信息与写操作、CLI 适配                                                                    |
| `herdr`      | Herdr 内置侧栏、终端与 Agent 集成                                                                              |

标准版默认选择以上能力；Personal 默认不选择可选能力，保留公共本地功能。Agent Flow（`agent-flow`）用于企业 AI Native 研发编排定制，启用 GitLab 与 Herdr，关闭云端备份，代码平台只支持 GitLab，不编译或展示 GitHub 集成，后续专属功能按模块接入；AI Native 编排目前仍为独立原型，尚未成为该产品的正式能力。云端同步不依赖 GitHub／GitLab，可使用通用 Git 远端；GitHub 引导连接仅在 `cloud-sync` 和 `github` 同时启用时编译。

例如，在统一配置的 `products` 中将个人版调整为仅包含云端同步和 GitLab：

```json
{
  "standard": ["cloud-sync", "github", "gitlab", "herdr"],
  "personal": ["cloud-sync", "gitlab"]
}
```

修改后重新编译相应产品。能力不是运行期用户偏好，设置页不能重新打开未编译的能力。关闭能力不会删除既有任务、平台绑定、备份目录、凭据或其他用户数据；重新启用后仍可按原协议读取。旧路由恢复到不可用页面时回到工作台，设置页不展示未编译的备份项。

`products/standard.json`、`products/personal.json`、`products/agent-flow.json` 只声明产品身份、侧栏排列和开发端口；内置产品的能力选择由统一配置提供。侧栏中属于未启用能力的入口会自动过滤，不需要再到另一份文件关闭开关。

产品清单包含：

- `id`：稳定产品身份，使用小写字母、数字和短横线，以小写字母开头。更改它会改变运行目录与应用身份。
- `iconDir`：可选图标目录，包含平台图标、SVG 母版和 macOS 单色托盘图标；Agent Flow 使用 `products/agent-flow/icons`，同时替换开发预览与构建后的网页图标。
- `productName`：可选安装包名称与窗口标题；Agent Flow 使用 `Agent Flow`。未配置时沿用默认产品名称。
- `sidebar.primary`、`sidebar.bottom`：上下两组入口及顺序，不得重复。统一能力配置决定哪些入口实际可用。
- `sidebar.defaultPanel`：默认面板 ID；其能力关闭后回退到可用面板。
- `devPort`：可选开发端口。标准版默认 1420，个人版 1421，其他 ID 派生默认端口。

内置产品在统一配置的 `products` 中声明能力。仓库外的产品清单通过 `features` 显式选择特性。外部清单可以沿用 `agent-flow` 产品 ID，保留安装标识和本机数据目录。`standard` 和 `personal` 由内置清单保留。

```bash
./agent-hub.sh build                                  # 标准版 release
./agent-hub.sh build --product personal --debug --bundles app
./agent-hub.sh build --product agent-flow --debug --bundles app
./agent-hub.sh dev --product agent-flow
./agent-hub.sh dev --product personal
./agent-hub.sh install --dev debug --product personal
npm run build -- --product personal                  # 只构建前端
```

也可将 `--product` 指向产品 JSON 文件。外部产品可通过清单的 `version` 设置桌面和 CLI 版本，省略时继承应用 `VERSION`。生成的配置、入口与缓存由脚本管理。

## 仓库与升级入口

| 仓库                                                                  | 维护范围                                                       |
| --------------------------------------------------------------------- | -------------------------------------------------------------- |
| [JTBlink/agent-hub](https://github.com/JTBlink/agent-hub)               | AgentHub 应用、CLI、SDK、运行器和内置内容快照                   |
| [JTBlink/agent-hub-skills](https://github.com/JTBlink/agent-hub-skills) | 可独立安装的公开 Skills、自动化任务模板，以及 Codex 和 Claude Code 插件清单 |

应用与 SDK 分别按 [桌面应用发布流程](../.agents/skills/github-cli/references/release-flow.md) 和 [SDK 发布规范](sdk-release.md) 维护版本。单独更新 Skill 或任务模板时，在 `agent-hub-skills` 提交发布。需要随下一个应用或 SDK 版本附带更新时，再在 `agent-hub` 刷新默认内容快照。

### 更新内置 Skills 与自动化任务

先在 [agent-hub-skills](https://github.com/JTBlink/agent-hub-skills) 更新和发布内容。AgentHub 使用 `products/default-content.json` 记录内容提交和快照摘要。桌面、CLI 和 SDK 构建都使用同一份快照，无需在构建中联网获取内容仓库。

选定公开内容仓库的提交后，在 AgentHub 仓库执行以下命令，把更新后的锁文件和快照一起提交。

```bash
content_revision='<内容仓库的完整提交 SHA>'
git fetch --no-tags https://github.com/JTBlink/agent-hub-skills.git "$content_revision"
node scripts/update-default-content.mjs "$content_revision"
```

## 复用和升级 Rust 核心库

完整桌面能力也可以通过 [AgentHub SDK](../packages/agent-hub-core/README.md) 交付。SDK 同时带上界面、Rust 宿主、CLI 和内置资源。独立产品可以通过 `sidebarModules` 注册自己的侧栏和页面，也可以通过 `pageOverrides.discover` 替换「发现」页面并沿用现有入口。

需要复用完整桌面功能时，在产品仓库固定一个 AgentHub 源码提交，使用其构建入口接收外部产品清单。此入口同时构建 React 工作台、Rust 宿主和配套 CLI，内置自动化资源也来自同一提交。产品清单可以选择全部可选集成：

```json
{
  "id": "agent-flow",
  "productName": "Agent Flow",
  "features": ["cloud-sync", "github", "gitlab", "herdr"],
  "sidebar": {
    "primary": [
      "projects",
      "search",
      "git",
      "tasks",
      "automation",
      "preview",
      "skills",
      "discover",
      "herdr"
    ],
    "bottom": ["dashboard", "backup", "settings"],
    "defaultPanel": "skills"
  }
}
```

在固定版本的 AgentHub 检出目录安装前端依赖后，用 `npm run app:build -- --product /path/to/product.json` 构建。内部清单、品牌资源与专属代码由独立产品仓库维护。

`packages/agent-hub-core` 的版本由它自己的 Cargo 清单维护。桌面与配套 CLI 通过同仓库路径依赖联调。完成 Registry 发布后，独立产品可以声明明确的库版本并提交自己的 `Cargo.lock`；升级时改依赖版本，重新验证实际调用与产品构建。

当前可复用的入口是 `agent_hub_core::agent_launch`，包括兼容旧方案的配置校验、启动命令解析和启动计划指纹。配置文件读写与修订保护由现有宿主管理。核心能力从真实调用逐步迁入，执行、平台和备份仍使用现有应用实现。迁移可选集成时继续由产品清单驱动同名 Cargo 特性，云端备份、同步和恢复复用单一 `cloud-sync` 开关。

```bash
cargo test --locked --manifest-path packages/agent-hub-core/Cargo.toml
cargo package --locked --manifest-path packages/agent-hub-core/Cargo.toml
```

测试覆盖库接口，打包校验确认源码归档能独立编译。以上命令适用于干净检出；验证本地未提交改动时可对 `cargo package` 追加 `--allow-dirty`。

独立产品在本地可以用 Cargo 的 `[patch.crates-io]` 将依赖指向同一版本的本地 checkout。正式构建使用 Registry 版本与提交的锁文件。新增能力先从实际调用方验证一条完整行为，再扩展库的公开接口。

## 新功能放在哪里

以尚未实现的 `notes` 为示例，下面的路径和代码只说明接入步骤，并非当前已注册功能：

```text
src/features/notes/
  module.ts                 # 侧栏与路由贡献
  components/               # NotesSidebar、NotesPage 等实现及相邻测试
  api.ts                    # 该功能使用的 IPC
src/integrations/notes/
  contracts.ts              # 公共调用方确实需要的共享契约
  disabled.ts               # 未启用时的适配，仅在存在公共调用方时创建
src-tauri/src/core/notes/   # 核心业务与相邻测试
src-tauri/src/commands/notes.rs  # 参数、权限与错误适配
```

公共工作台接口位于 `src/app/features/`，产品默认值与构建校验位于 `src/app/product/`；构建解析及静态入口生成位于 `packages/agent-hub-core/build/`。不复制 App、Layout、Provider 或公共终端实现。

功能没有公共调用方时，不需要创建缺省适配、通用 trait 或单独 crate。共享契约不得反向导入功能实现，否则关闭特性后仍会把实现带入编译图。

## 1. 登记 Rust feature

在 `src-tauri/Cargo.toml` 声明 `notes = []`，有实际依赖时在该特性中表达依赖；专属第三方库声明 `optional = true` 并通过 `dep:<依赖名>` 启用。同时在 `products/features.json` 登记能力；各产品是否启用只在该文件的 `products` 中选择，不默认加入全部产品。Cargo 的 `standard` 默认集合保留直接使用 Cargo 时的兼容入口；正式产品构建始终使用显式特性集合。

在 core、commands 的模块声明处使用同一条件：

```rust
#[cfg(feature = "notes")]
pub mod notes;
```

命令在唯一的公共 IPC handler 中条件注册，沿用可信主 WebView 校验：

```rust
#[cfg(feature = "notes")]
commands::notes::list_notes,
```

同时处理状态初始化、后台启动、退出清理、CLI 子命令和嵌入资源。`if cfg!(...)` 不能代替排除模块的 `#[cfg(...)]`。公共代码不能无条件引用被关闭的类型或函数；跨功能联动由可选集成承接，不把公共能力强制依赖到新功能。

现有 `src-tauri/build.rs` 校验实际 Cargo 特性，`src-tauri/src/product/mod.rs` 的 `current()` 报告实际特性。**新增 feature 必须同步更新这两处显式清单**，并保持排序一致，否则前后端构建身份会不匹配。不要从运行时环境变量推断已编译能力。

## 2. 声明独立侧栏模块

当前 `FeatureModule` 支持面板贡献及可选路由；`sidebar.kind` 目前只有 `panel`，尚无通用 link 贡献接口。示例：

```tsx
import type { FeatureModule } from "../../app/features/types";
import { NotesSidebar } from "./components/NotesSidebar";
import { NotesIcon } from "./components/NotesIcon";

export const notesModule: FeatureModule = {
  id: "notes",
  sidebar: {
    kind: "panel",
    id: "notes",
    labelKey: "notes.title",
    icon: NotesIcon,
    component: NotesSidebar,
  },
};
```

面板接收 `active: boolean`。非活动面板可能为了保存界面状态仍保持挂载；查询、订阅、轮询和键盘监听应以 active 为依据，并在失活或卸载时清理。需要随项目工作区激活的功能设置 `workspace: true`；普通独立面板不要照搬这一设置。

页面通过 `routes` 贡献到公共布局，路由路径和模块 ID 需保持唯一；不要让通用路由文件静态导入全部可选页面。大面板可参考 Herdr 的惰性加载入口，但惰性加载只能延迟已启用功能，不能替代编译排除。

模块自行使用公共 Context 或窄范围 adapter，公共 Sidebar 不管理功能业务状态。新增文案同步中、英、繁体资源。

## 3. 登记前端构建入口

静态入口生成器按统一能力清单选择集成别名与平台模块，Herdr 面板贡献仍有明确的生成入口，不是自动发现插件系统。新增 Notes 时需要补齐以下位置：

| 位置                                                             | 必须处理的内容                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/agent-hub-core/build/config.mjs` 的 `modules`、`panels` | 登记侧栏／默认面板 ID，增加入口需要对应 Cargo 特性的校验     |
| 同文件的 `prepareProduct()`                                      | 根据实际特性生成 `features.ts`，仅导入已启用的 `notesModule` |
| `src/app/features/default.ts`                                    | 若默认标准版包含 Notes，登记普通开发入口                     |
| `src/app/product/default.ts`                                     | 同步默认特性集合、侧栏顺序和默认面板                         |
| 产品 JSON                                                        | 仅为需要 Notes 的产品选择特性和入口                          |

有跨功能调用时，再增加 Notes 的实现／缺省 adapter 选择，并在 Vite 和 TypeScript 中使用相同别名。每增加一个别名，同步 `tsconfig.app.json`、生成的产品 tsconfig 和 Vite 产品配置；不能只改调用方。这也是避免 `Cannot find module '@app/…'` 的关键。

`@app/features` 负责生成的模块列表，`@app/product` 负责产品身份；`@app/herdr` 是已有 Herdr 集成接口，不复用它接入其他功能。

专属样式、语言资源、帮助、模板、图标和 sidecar 也要按特性选择。全量 glob、公共 barrel 导出、公共文件顶层 import 都可能重新引入被排除实现。扩展 Vite 的产物检查，让关闭 Notes 的构建能拒绝其实现进入模块清单；不要只检查菜单是否显示。

## 路径与兼容性

标准版运行目录保持 `~/.agent-hub/`，个人版使用 `~/.agent-hub-personal/`，例如备份为 `~/.agent-hub-personal/backup`。其他独立产品采用 `~/.agent-hub-<产品ID>/`。所有业务路径从 Rust product／central_repo 模块派生，功能内部不拼接产品主目录。

标准 Cargo 输出位于 `src-tauri/target/`，其他产品位于其同级 `target-products/<产品与配置摘要>/`。前端、sidecar 与类型缓存位于 `node_modules/.cache/agent-hub/products/` 的独立子目录；更新特性集合会改变构建摘要，不改变稳定产品数据身份。

早期本地测试曾使用 `~/.agent-hub-products/personal/`。新默认路径不自动合并该目录；已有内容应在停止旧实例后显式迁移，并检查数据库路径、任务执行回执和自定义库配置，不直接对运行中的数据库移动目录。旧目录不能因换名而自动删除。

不同产品仍可能操作用户选择的同一个项目、原生 Agent 目录或系统 Hosts。这些是外部共享资源，继续遵守原有路径、修订、锁和授权规则。关闭功能不得删除用户数据、重排已发布迁移或终止既有外部会话。

## 只验证核心路径

先选一个包含 Notes 的产品和一个排除 Notes 的产品，完成一条贯穿构建与运行的验证链：

1. 启用时侧栏、页面与代表性命令正常；默认标准行为保持。
2. 关闭时前端构建图、Rust 模块、IPC／CLI 和专属资源均不包含 Notes，公共终端等能力仍正常。
3. 两种构建连续执行不会覆盖彼此的 CLI、资源或数据；`build-info` 与前端摘要一致。
4. 配置错误明确失败，已有数据在关闭、重新启用后保留。

构建目录内的 `product-build.json` 可检查前端实际模块。Rust 使用对应 feature set 的编译／Clippy，并通过公开 CLI 或 IPC 验证关键行为。测试就近放置，覆盖上述可观察行为；不为字段值、内部函数调用或源码字符串逐项增加用例。纯文档变更只检查格式与链接。

维护架构事实时更新[应用组装边界](architecture/app-composition.md)；后续设计放在[产品方案](plans/product-features.md)，执行状态与验证回写 GitHub Issue。
