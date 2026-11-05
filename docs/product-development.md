# 产品配置与独立功能开发

本文说明如何为 AgentHub 增加编译期可选功能，以及如何配置产品。构建操作和产物位置见[编译、打包与安装](build-and-install.md)，整体组装方式见[应用组装边界](architecture/app-composition.md)。

当前只完成 Herdr 的整体可选化。其他现有功能仍属于公共基线；增加新功能时，需要同时登记 Rust 与前端的编译入口，不能只增加菜单或配置文件。

## 配置一个产品

公开产品清单位于 `products/`：

| 配置            | 定位                            | 特性                                 |
| --------------- | ------------------------------- | ------------------------------------ |
| `standard.json` | 默认标准版                      | `standard` 集合，当前包含 `herdr`    |
| `personal.json` | Personal 个人版，面向个人开发者 | 空特性集合，保留公共基线，不含 Herdr |

`features: []` 表示不启用可选特性，并不表示没有任何功能。Cargo 的依赖闭包决定实际启用集合，例如 `standard` 会带入 `herdr`。

产品清单包含：

- `id`：稳定产品身份，只使用小写字母、数字和短横线，以小写字母开头。更改它会改变运行目录与应用身份，不用版本号作为 ID。
- `features`：Cargo 特性根集合；不要直接向构建命令追加 `--features`。
- `sidebar.primary`、`sidebar.bottom`：上下两组入口，数组顺序就是显示顺序；入口不得重复。
- `sidebar.defaultPanel`：已启用、已列入侧栏的面板 ID，不是路由地址。
- `devPort`：可选开发端口。标准版默认 1420，个人版 1421，其他 ID 派生默认端口；多产品同时开发时确认端口不冲突。

隐藏侧栏入口不会关闭功能；关闭功能应从 `features` 移除，并同步移除其入口。配置校验会拒绝缺失实现的入口。

```bash
./agent-hub.sh build                                  # 标准版 release
./agent-hub.sh build --product personal --debug --bundles app
./agent-hub.sh dev --product personal
./agent-hub.sh install --dev debug --product personal
npm run build -- --product personal                  # 只构建前端
```

也可将 `--product` 指向产品 JSON 文件。产品选择、Cargo profile 和应用 `VERSION` 相互独立。生成的配置、入口与缓存由脚本管理，不手工编辑。

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

公共工作台接口位于 `src/app/features/`，产品默认值与构建校验位于 `src/app/product/`；构建解析及静态入口生成位于 `scripts/app/product/`。不复制 App、Layout、Provider 或公共终端实现。

功能没有公共调用方时，不需要创建缺省适配、通用 trait 或单独 crate。共享契约不得反向导入功能实现，否则关闭特性后仍会把实现带入编译图。

## 1. 登记 Rust feature

在 `src-tauri/Cargo.toml` 声明 `notes = []`，有实际依赖时在该特性中表达依赖；专属第三方库声明 `optional = true` 并通过 `dep:<依赖名>` 启用。是否加入 `standard` 集合由产品需求决定，不默认把新功能加到全部产品。

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

当前静态入口生成器针对 Herdr 建立了首个实现，还不是自动发现插件系统。新增 Notes 时需要补齐以下位置：

| 位置                                                    | 必须处理的内容                                               |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `scripts/app/product/config.mjs` 的 `modules`、`panels` | 登记侧栏／默认面板 ID，增加入口需要对应 Cargo 特性的校验     |
| 同文件的 `prepareProduct()`                             | 根据实际特性生成 `features.ts`，仅导入已启用的 `notesModule` |
| `src/app/features/default.ts`                           | 若默认标准版包含 Notes，登记普通开发入口                     |
| `src/app/product/default.ts`                            | 同步默认特性集合、侧栏顺序和默认面板                         |
| 产品 JSON                                               | 仅为需要 Notes 的产品选择特性和入口                          |

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
