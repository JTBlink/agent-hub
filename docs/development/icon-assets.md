# 应用图标资源规范

> 状态：V1 已落地（2026-08-23）

## 母版

唯一可编辑母版是 [`src-tauri/icons/app-icon.svg`](../../src-tauri/icons/app-icon.svg)，对应导出的 [`1024x1024.png`](../../src-tauri/icons/1024x1024.png)。所有平台尺寸都必须从母版重新导出，禁止在小尺寸之间二次放大。

| 项目     | 规范                                                      |
| -------- | --------------------------------------------------------- |
| 画布     | 1024 × 1024 px                                            |
| 格式     | RGBA PNG；母版同时保留 SVG                                |
| 底板几何 | x/y = 97 px，宽高 = 830 px，圆角半径约 192 px             |
| 内边框   | x/y = 105 px，宽高 = 814 px，圆角半径约 184 px，描边 6 px |
| 有效边界 | 抗锯齿后的 alpha bbox 允许扩展到约 `(68, 68, 956, 956)`   |
| 透明区域 | 仅允许圆角底板外侧；底板与主体均不使用半透明效果          |
| macOS    | ICNS 含 16/32/128/256/512/1024 及对应 @2x 层级            |

## 主体图形

- 主体直接复用首页“Agent 连接拓扑”右侧圆形 Hub 中的 `BrandGlyph`：三个 Agent 节点汇入中心 Hub，不再为桌面图标另行设计拓扑结构。
- `BrandGlyph` 的 SVG 路径、节点配色、连接线、中心 Hub 比例与界面组件一致；中心 Hub 保留青色描边、蓝色填充和白色核心，桌面母版仅负责等比放大并增加圆形承载面。
- 圆形承载面复用页面 `.hub-orbit` 的左上径向高光、深色底面、亮边和低位阴影；可见边界约为 `x = 203–821 px`、`y = 203–826 px`，到底板外接矩形的四边安全间距不小于 `106 px`。
- 圆形承载面到圆角底板边界的真实最短距离不得小于 `80 px`，不能只用外接矩形的水平、垂直留白代替圆角距离。
- 中心 Hub、节点、圆形轨道和连接流必须整体等比调整，不能单独放大中心标记。
- 底板、节点、连接线和中心标记保持不透明；不添加外部投影或玻璃效果，避免与 macOS 系统阴影叠加。
- PNG 和 ICNS 始终保留正方形画布，不预先裁切到内容边界。

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

1024 PNG 必须报告 `8-bit/color RGBA`；当前无外部阴影，因此 alpha bounding box 应为 `(97, 97, 927, 927)`。底板内部 alpha 必须为 `255`；主体主色边界与底板的四边距离不得小于 `80 px`。ICNS 必须由同一母版生成，并包含 `16x16`、`32x32`、`128x128`、`256x256`、`512x512` 及各自 `@2x` 层级。

## 文件职责

| 文件                            | 用途                            |
| ------------------------------- | ------------------------------- |
| `src-tauri/icons/app-icon.svg`  | 唯一可编辑母版                  |
| `src-tauri/icons/1024x1024.png` | 1024 px RGBA 运行时/导出母版    |
| `src-tauri/icons/icon.icns`     | macOS Finder、Dock 与安装包图标 |
| `src-tauri/icons/icon.png`      | Tauri 通用运行时图标            |
| `src-tauri/icons/icon.ico`      | Windows 安装包与应用图标        |

## 禁止事项

- 不得把不透明底板改为整块透明或半透明。
- 不得把主体放大到接近 1024 px 画布边缘，或让主体安全间距小于 80 px。
- 不得为 macOS 单独制作另一套主体比例。
- 不得在导出阶段改变渐变方向、颜色、节点位置或中心 Hub 比例。
- 不得分别手工调整 ICNS 的各尺寸图层。
