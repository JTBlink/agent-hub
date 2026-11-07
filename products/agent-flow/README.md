# Agent Flow 定制版

Agent Flow 是面向企业 AI Native 研发编排的定制产品，产品 ID 为 `agent-flow`。标准版 `standard` 继续提供完整能力；本产品独立选择云端同步、GitLab 和 Herdr，不编译 GitHub 平台集成，不展示 GitHub 账号、更新、发布页和反馈入口。AI Native 编排仍是独立原型，正式执行能力后续按模块接入。

产品身份与侧栏见 [`../agent-flow.json`](../agent-flow.json)，能力选择统一维护在 [`../features.json`](../features.json)。沿用共享构建流程：

```bash
./agent-hub.sh dev --product agent-flow
./agent-hub.sh build --product agent-flow --debug --bundles app
```

## 品牌与图标

企业定制版暂定采用原版长弧流带造型：多片曲面汇成连续环形，中央开口表达协作与反馈，向右上舒展的末端表达持续推进。AF 仅作为轮廓与折面中的隐含线索，不使用明显字标。配色调整为冰蓝主面、雾青流带与淡紫上缘，内折使用稍深的蓝色以保证小尺寸层次。

`icons/flow-master.png` 保存换色后的位图母版；`icons/app-icon.svg` 嵌入母版，并通过矢量边界和同色底层规范透明边缘及中央开口。SVG 是导出容器，不是纯矢量描摹。更新母版时应同时更新 SVG 的嵌入图像与轮廓，保持同一版本。

`icons/tray-template.svg` 为同一外轮廓与中央开口的单色矢量版，针对 macOS 菜单栏扩大有效面积。设计候选、对比图和临时导出不随产品分发。

应用 PNG、ICNS、ICO 和平台尺寸由母版统一导出；网页 favicon、标题栏与安装包使用同一组资源。标准版继续使用原图标。

```bash
npm run tauri -- icon products/agent-flow/icons/app-icon.svg -o products/agent-flow/icons
npm run tauri -- icon products/agent-flow/icons/app-icon.svg -o products/agent-flow/icons -p 1024
npm run tauri -- icon products/agent-flow/icons/tray-template.svg -o node_modules/.cache/agent-flow-tray -p 32
cp node_modules/.cache/agent-flow-tray/32x32.png products/agent-flow/icons/tray-template.png
```

运行数据默认位于 `~/.agent-hub-agent-flow/`，独立应用标识为 `com.jtstudio.agenthub.agent-flow`。产品名称和图标不改变项目内的共享协议。
