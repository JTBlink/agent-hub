# 应用图标资源规范

> 状态：三片穿插图标保留深浅两版，默认深色（2026-11-08）

## 母版与来源

标准版保留两套母版，默认使用深色版：

| 版本 | 母版与导出目录                                                                   | 默认行为                          |
| ---- | -------------------------------------------------------------------------------- | --------------------------------- |
| 深色 | [`src-tauri/icons/variants/dark/`](../../../../src-tauri/icons/variants/dark/)   | 应用、网页、README 与截图默认使用 |
| 浅色 | [`src-tauri/icons/variants/light/`](../../../../src-tauri/icons/variants/light/) | 保留完整平台资源，供显式选择      |

每套的 `1024x1024.png` 均为 RGBA 母版，平台尺寸从各自母版直接缩小导出，不在小尺寸之间放大。根目录 [`src-tauri/icons/`](../../../../src-tauri/icons/) 是深色版的兼容输出入口，不单独修改，也不随应用明暗主题自动切换。

[`app-icon.svg`](../../../../src-tauri/icons/app-icon.svg) 是同一 PNG 的无损内嵌封装，服务网页和现有构建消费方，**不是可编辑的矢量路径**。修改图形时更新位图母版，再统一导出，不能单独修改 SVG 或平台尺寸。

确认稿仅保留 [`dark.png`](../../../../docs/images/brand-concepts/dark.png) 与 [`light.png`](../../../../docs/images/brand-concepts/light.png)。两张均为 1254 px 展示图，底板边界约为 `(106, 110)–(1142, 1143)`；转换时去掉展示背景，将底板归一到下述画布规格，再以圆角路径裁切透明区域。展示图不直接参与构建，历史探索稿不保留。

| 项目     | 规范                                                           |
| -------- | -------------------------------------------------------------- |
| 画布     | 1024 × 1024 px，保留完整正方形画布                             |
| 格式     | 8-bit RGBA PNG；SVG 为该位图的无损封装                         |
| 底板     | x/y = 97 px，宽高 = 830 px，圆角半径 = 192 px                  |
| 主体     | 三片宽曲面组成圆角三角闭环，保留较小的圆角三角中心留白         |
| 配色     | 默认深蓝灰底座；浅色版为冰青白底座；主体保持蓝、青、绿自然渐变 |
| 透明区域 | 仅底板外侧；底板与中心开口均保持不透明                         |
| macOS    | 不预加外部投影，使用系统阴影；ICNS 保留标准尺寸与 @2x 图层     |

## 主体与产品边界

- 保留确认稿中的三片穿插关系、轮廓、比例和渐变，不在导出时重新生成设计。
- 主体边界约为 x = 177–841 px、y = 178–815 px，与底板四边保持约 80 px 以上留白。
- 中心开口显示底板原色，不穿透到桌面；不增加字母、节点、播放符号或外部阴影。
- 桌面、应用顶部和网页品牌入口统一消费当前标记，不再用旧节点图形替代品牌图标。
- `products/agent-flow/icons/` 为独立产品资源，不随标准版图标导出修改。

## 生成与同步

更新对应 `variants/dark/` 或 `variants/light/` 的 1024 px 母版后，从仓库根目录执行：

```bash
node scripts/icons/export.mjs
```

脚本分别校验、导出两版的无损 SVG、ICNS、ICO 与各平台 PNG，生成菜单栏单色模板，再将深色版同步到根目录和 `public/icons/`。相同内容不重复覆盖默认输出。产品构建继续沿用现有资源入口。

只重新导出某一备用版本的平台尺寸而不改变默认入口时，例如：

```bash
npm run tauri -- icon src-tauri/icons/variants/light/1024x1024.png -o src-tauri/icons/variants/light -v
```

不要手工编辑平台 PNG、ICNS 或 ICO，不把展示图的外背景和投影打包进图标。

## 顶部标记、网页与文档

- macOS 菜单栏使用独立的 [`tray-template.svg`](../../../../src-tauri/icons/tray-template.svg) 轮廓母版。统一导出脚本生成 32 px 透明单色 PNG，运行时沿用系统模板图标的黑白适配。模板不包含深浅底板，不再使用旧节点标记。
- 应用标题栏与 favicon 使用 `public/icons/32x32.png`；README 标题使用默认 `128x128.png`，避免依赖 SVG 位图内嵌在第三方渲染器中的支持。
- 官网构建输出 `assets/app-icon-128.png` 与 `assets/app-icon-32.png`，供官网和帮助站的品牌标记与 favicon 共用，默认均为深色。
- 产品截图通过合成数据预览重新拍摄，README 与官网共用 `docs/images/` 下的源图，不手工涂改截图中的标记。更新命令见[截图说明](../../../../docs/images/README.md)。

## 验收

```bash
file src-tauri/icons/1024x1024.png src-tauri/icons/icon.icns src-tauri/icons/icon.ico
iconutil --convert iconset src-tauri/icons/icon.icns --output /tmp/agent-hub.iconset
```

- PNG 为 1024 px、8-bit RGBA，alpha bounding box 为 `(97, 97, 927, 927)`。
- 底板内部和中心留白不透明，底板外没有展示背景或杂点。
- 检查明暗背景上的 16、32、64、128 px 轮廓和开口，保留统一的图形比例。
- ICNS 包含 16/32/128/256/512 及对应 @2x 图层，各层来自同一母版。
- `public/icons/` 三个文件与母版目录对应文件逐字节一致；SVG 内嵌 PNG 与母版逐字节一致。
- 运行开发版时，确认应用包 `Contents/Resources/icon.icns` 已同步，不以源码修改代替运行资源核对。

## 文件职责

| 文件                            | 用途                                           |
| ------------------------------- | ---------------------------------------------- |
| `src-tauri/icons/1024x1024.png` | 默认深色母版的兼容副本                         |
| `src-tauri/icons/app-icon.svg`  | 母版的无损 SVG 封装，供网页与现有构建消费      |
| `src-tauri/icons/icon.icns`     | macOS Finder、Dock 与安装包                    |
| `src-tauri/icons/icon.png`      | Tauri 通用运行时图标                           |
| `src-tauri/icons/icon.ico`      | Windows 安装包与应用                           |
| `public/icons/`                 | 同源网页图标                                   |
| `scripts/icons/export.mjs`      | 两套母版校验、统一导出、托盘生成与默认入口同步 |
