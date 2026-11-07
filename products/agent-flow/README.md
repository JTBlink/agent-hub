# Agent Flow 定制版

Agent Flow 是面向企业 AI Native 研发编排的定制产品，产品 ID 为 `agent-flow`。标准版 `standard` 继续提供完整能力；本产品独立选择云端同步、GitLab 和 Herdr，不编译 GitHub 平台集成，不展示 GitHub 账号、更新、发布页和反馈入口。AI Native 编排仍是独立原型，正式执行能力后续按模块接入。

产品身份与侧栏见 [`../agent-flow.json`](../agent-flow.json)，能力选择统一维护在 [`../features.json`](../features.json)。沿用共享构建流程：

```bash
./agent-hub.sh dev --product agent-flow
./agent-hub.sh build --product agent-flow --debug --bundles app
```

## 品牌与图标

应用图标采用简化 AF 连体字标：A 的三角开口、F 的两道横笔与共享中横构成单一紧凑轮廓，转角适度圆润。配色为浅雾蓝 `#7B9CD2`、淡蓝 `#96ADE0` 与淡长春花紫 `#B0A9DE` 的单层渐变。整体保持扁平，不添加折面、高光、投影或底板。

`icons/app-icon.svg` 是唯一可编辑矢量母版，图形来自 AF 概念稿的几何整理；所有平台资源从母版统一导出。`icons/tray-template.svg` 使用同一轮廓的单色版本，并扩大有效面积以适应菜单栏。

应用 PNG、ICNS、ICO 和平台尺寸由母版统一导出；网页 favicon、标题栏与安装包使用同一组资源。标准版继续使用原图标。

```bash
npm run tauri -- icon products/agent-flow/icons/app-icon.svg -o products/agent-flow/icons
npm run tauri -- icon products/agent-flow/icons/app-icon.svg -o products/agent-flow/icons -p 1024
npm run tauri -- icon products/agent-flow/icons/tray-template.svg -o node_modules/.cache/agent-flow-tray -p 32
cp node_modules/.cache/agent-flow-tray/32x32.png products/agent-flow/icons/tray-template.png
```

运行数据默认位于 `~/.agent-hub-agent-flow/`，独立应用标识为 `com.jtstudio.agenthub.agent-flow`。产品名称和图标不改变项目内的共享协议。
