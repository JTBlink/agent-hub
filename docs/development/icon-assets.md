# 应用图标资源规范

> 状态：V1 已落地（2026-08-23）

## 母版

唯一可编辑母版是 [`src-tauri/icons/app-icon.svg`](../../src-tauri/icons/app-icon.svg)，对应导出的 [`1024x1024.png`](../../src-tauri/icons/1024x1024.png)。所有平台尺寸都必须从母版重新导出，禁止在小尺寸之间二次放大。

| 项目         | 规范                                           |
| ------------ | ---------------------------------------------- |
| 画布         | 1024 × 1024 px                                 |
| 格式         | RGBA PNG；母版同时保留 SVG                     |
| 有效图标范围 | x/y = 68 px，宽高 = 888 px                     |
| 圆角底板     | 深色不透明填充，底板圆角半径约 192 px          |
| 内边框       | 8 px，不使用半透明阴影或玻璃效果               |
| 透明区域     | 仅允许圆角底板外侧；内容区域不使用透明装饰     |
| macOS        | ICNS 含 16/32/128/256/512/1024 及对应 @2x 层级 |

## 生成命令

修改母版后，从仓库根目录执行：

```bash
npm run tauri -- icon src-tauri/icons/app-icon.svg -o src-tauri/icons -v
npm run tauri -- icon src-tauri/icons/app-icon.svg -o src-tauri/icons -p 1024
```

第一条生成 Tauri、macOS、Windows、Android、iOS 的标准资源；第二条保留 1024 px 母版 PNG。不要手动编辑生成后的平台 PNG。

## 验收

```bash
file src-tauri/icons/1024x1024.png src-tauri/icons/icon.icns
iconutil --convert iconset src-tauri/icons/icon.icns --output /tmp/agent-hub.iconset
```

1024 PNG 必须报告 `8-bit/color RGBA`，alpha bounding box 应为 `(68, 68, 956, 956)`；ICNS iconset 应包含 `16x16`、`32x32`、`128x128`、`256x256`、`512x512` 及各自 `@2x` 层级。
