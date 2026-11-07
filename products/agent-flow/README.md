# Agent Flow 定制版

Agent Flow 是面向企业 AI Native 研发编排的定制产品，产品 ID 为 `agent-flow`。标准版 `standard` 继续提供完整能力；本产品独立选择云端同步、GitLab 和 Herdr，不编译 GitHub 平台集成，不展示 GitHub 账号、更新、发布页和反馈入口。AI Native 编排仍是独立原型，正式执行能力后续按模块接入。

产品身份与侧栏见 [`../agent-flow.json`](../agent-flow.json)，能力选择统一维护在 [`../features.json`](../features.json)。沿用共享构建流程：

```bash
./agent-hub.sh dev --product agent-flow
./agent-hub.sh build --product agent-flow --debug --bundles app
```

## 品牌与图标

应用图标采用独立设计的蓝绿流体折面：多股弧面汇聚、翻转后向右上舒展，表达多 Agent 协作与流程推进。深蓝内侧、天蓝主面与青绿上缘通过连续明暗形成体积感。轮廓外与中心开口保持透明，不添加底板、文字或外部投影。

`icons/flow-master.png` 是权威位图母版，由图像生成工具创作；`icons/app-icon.svg` 仅嵌入该母版并规范导出画布与安全边距，不是可编辑矢量描摹。更新设计时同步刷新嵌入图像，再导出平台图标。

`icons/tray-template.svg` 为针对菜单栏绘制的单色简化轮廓，保留舒展上缘与中心开口。

应用 PNG、ICNS、ICO 和平台尺寸由母版统一导出；网页 favicon、标题栏与安装包使用同一组资源。标准版继续使用原图标。

```bash
npm run tauri -- icon products/agent-flow/icons/app-icon.svg -o products/agent-flow/icons
npm run tauri -- icon products/agent-flow/icons/app-icon.svg -o products/agent-flow/icons -p 1024
npm run tauri -- icon products/agent-flow/icons/tray-template.svg -o node_modules/.cache/agent-flow-tray -p 32
cp node_modules/.cache/agent-flow-tray/32x32.png products/agent-flow/icons/tray-template.png
```

运行数据默认位于 `~/.agent-hub-agent-flow/`，独立应用标识为 `com.jtstudio.agenthub.agent-flow`。产品名称和图标不改变项目内的共享协议。
