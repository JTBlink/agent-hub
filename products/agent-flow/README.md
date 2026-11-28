# Agent Flow 定制版

Agent Flow 是面向企业 AI Native 研发编排的定制产品，产品 ID 为 `agent-flow`。标准版 `standard` 继续提供完整能力；本产品启用 GitLab 和 Herdr。云端备份与 GitHub 集成默认关闭。AI Native 编排仍是独立原型，正式执行能力后续按模块接入。

产品身份见 [`../agent-flow.json`](../agent-flow.json)，能力选择见 [`../features.json`](../features.json)。[工作台预设](../layouts/agent-flow.json) 定义侧栏和深蓝灰默认主题，主题偏好独立于标准版。沿用共享构建流程：

```bash
./agent-hub.sh dev --product agent-flow
./agent-hub.sh build --product agent-flow --debug --bundles app
```

## 品牌与图标

Agent Flow 使用早期蓝绿流带图标。深蓝内折、亮蓝主面与青绿上缘从左下向右上舒展。图标采用深蓝灰圆角底板，中央开口露出底色，底板外保留透明。

`icons/flow-master.png` 为位图母版，`icons/app-icon.svg` 嵌入该母版。macOS 菜单栏使用同一轮廓的单色 `icons/tray-template.svg`。

应用 PNG、ICNS、ICO 和平台尺寸由母版统一导出；网页 favicon、标题栏与安装包使用同一组资源。标准版继续使用原图标。

```bash
npm run tauri -- icon products/agent-flow/icons/app-icon.svg -o products/agent-flow/icons --ios-color '#121d2b'
npm run tauri -- icon products/agent-flow/icons/app-icon.svg -o products/agent-flow/icons -p 1024
npm run tauri -- icon products/agent-flow/icons/tray-template.svg -o node_modules/.cache/agent-flow-tray -p 32
cp node_modules/.cache/agent-flow-tray/32x32.png products/agent-flow/icons/tray-template.png
```

运行数据与 AgentHub 标准版共用 `~/.agent-hub/`。安装标识为 `com.jtstudio.agenthub.agent-flow`，CLI 发布到 `~/.agent-hub-agent-flow/bin/agent-flow-cli`。产品名称和图标不改变项目内的共享协议。
