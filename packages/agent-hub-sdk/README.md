# AgentHub SDK

此源码包包含 React 工作台、Rust 宿主、CLI 和内置资源。解压后安装依赖，再从 SDK 目录传入自己的产品清单构建：

```bash
npm ci
npm run app:build -- --product /path/to/product.json
```

构建需要 Node.js、npm、Rust 和目标平台的 Tauri 原生工具链。平台依赖与包位置见解压目录中的 `docs/build-and-install.md`。

## 产品清单

每个产品维护自己的清单。下面的例子启用全部可选集成，并沿用 Agent Flow 的应用身份：

```json
{
  "id": "agent-flow",
  "productName": "Agent Flow",
  "version": "2.4.0",
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

`cloud-sync` 同时控制 Skill、自动化任务和用户配置的云端备份、同步与恢复。品牌资源可以通过 `iconDir` 配置，路径相对 SDK 根目录。更多选项见解压目录中的 `docs/product-development.md`。

并行维护的独立产品使用不同的 `id`，以获得各自的安装标识和数据目录。同一产品升级时继续使用原 ID。

外部产品可以用 `version` 管理自己的桌面与 CLI 版本，格式为三段整数，每段在 0 到 65535 之间。该字段独立于 `SDK_VERSION`。省略时继承 SDK 包内的应用基础版本。

## 产品扩展

在产品清单的 `sidebarModules` 中声明模块 ID 和入口，路径相对 SDK 根目录。把入口文件随私有产品维护，并在构建前放到对应路径。将同一个 ID 加入 `sidebar.primary` 或 `sidebar.bottom`。

```json
{
  "sidebarModules": {
    "review-workbench": "custom/review-workbench.tsx"
  }
}
```

入口使用默认导出实现 `FeatureModule`。模块的 `id` 和 `sidebar.id` 使用清单中的 ID，并可通过 `routes` 提供自己的页面。侧栏面板可共享应用布局和 Provider。

```tsx
import type { FeatureModule } from "@app/features";

export default {
  id: "review-workbench",
  sidebar: {
    kind: "panel",
    id: "review-workbench",
    labelKey: "Review",
    icon: () => <svg aria-hidden="true" />,
    component: () => <p>Review workbench</p>,
  },
} satisfies FeatureModule;
```

## 校验与升级

下载归档和对应的 `.sha256`，将它们放在同一目录后运行 `shasum -a 256 -c <归档名>.sha256`。归档包含 `RELEASE-NOTES.md`、`CHANGELOG.md` 和 `LICENSE`。下游锁定 `SDK_VERSION`，`VERSION` 是应用的默认版本，`SDK_REVISION` 记录基础源码提交。

下游仓库可以记录发行清单 `*-manifest.json` 中的 SDK 版本、源码提交和 SHA-256，并在 CI 解压前校验归档。升级时更新这些值，解压新版本，沿用产品清单和私有扩展，再重新构建。保留产品 ID 可以继续使用原安装身份和数据目录。

产品仓库可使用独立的 `install.mjs`。把发行清单中的 `version`、`revision` 和 `sha256` 记录到 `sdk-lock.json`，并添加 `source` 字段。它可以是 HTTPS 下载地址或相对锁文件的本地包路径。

```bash
node install.mjs sdk-lock.json .build/agent-hub-sdk
```

安装器校验归档后解压到指定的新目录。升级时使用新目录，待定制构建验证通过后再切换依赖。

产品仓库也可以使用随包提供的配套构建脚本，把两份脚本放在同一目录并保留配对的文件名。将侧栏源码和品牌文件放在 `product.json` 同级的 `custom/` 中，在清单里用 `custom/...` 引用：

```bash
node agent-hub-sdk-0.1.0-build-product.mjs sdk-lock.json product.json .build/sdk-0.1.0
```

构建脚本安装锁定版本，将产品的 `custom/` 复制到新 SDK 目录，再安装依赖并构建桌面应用。追加 `--frontend` 只验证前端，或在 `--` 后传入桌面构建参数，例如 `-- --debug --no-bundle`。构建产物和 SDK 都在指定目录内。

维护者可从干净的 AgentHub 检出生成 SDK 归档及配套发行文件：

```bash
node packages/agent-hub-sdk/package.mjs /path/to/agent-hub-sdk.tar.gz
```

本地预览可追加 `--working-tree`。发行说明会标明预览包包含工作区改动。

仓库的 **SDK Candidate** 工作流可从指定提交生成候选包。上传候选前会校验 SHA-256，从解压目录构建两份带不同侧栏扩展的产品，并检查两组能力配置的 Rust 宿主和 CLI。

正式发布使用 `sdk-v<SDK 版本>` 标签。**SDK Release** 工作流取用同一源码提交的成功候选，重新验证归档、源码版本和配套脚本，再上传到对应的 GitHub Release。下游在锁文件中使用该 Release 的归档地址。SDK 发版使用独立的标签命名空间，桌面应用继续使用 `v<应用版本>`。
