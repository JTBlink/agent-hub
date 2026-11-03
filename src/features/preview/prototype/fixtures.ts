// Synthetic content. This prototype performs no remote or Agent operations.
export type PreviewKind = "web" | "html" | "markdown";
export type PreviewTab = {
  id: number;
  kind: PreviewKind;
  title: string;
  url: string;
  history: string[];
  cursor: number;
  profile: string;
  content?: string;
};
export type Capture = {
  id: number;
  tabId: number;
  url: string;
  selector: string;
  text: string;
  html: string;
  styles: string;
  width: number;
  height: number;
  note: string;
  screenshot: boolean;
  source?: string;
};
export const initialTabs: PreviewTab[] = [
  {
    id: 1,
    kind: "web",
    title: "工作台概览",
    url: "http://localhost:3000",
    history: ["http://localhost:3000"],
    cursor: 0,
    profile: "开发环境",
  },
  {
    id: 2,
    kind: "markdown",
    title: "README.md",
    url: "workspace:///docs/README.md",
    history: ["workspace:///docs/README.md"],
    cursor: 0,
    profile: "开发环境",
  },
  {
    id: 3,
    kind: "html",
    title: "preview.html",
    url: "workspace:///examples/preview.html",
    history: ["workspace:///examples/preview.html"],
    cursor: 0,
    profile: "开发环境",
  },
];
export const markdown = `# 让每一次预览，都能接着工作

在同一个地方阅读文档、检查网页，并把具体的修改意见交给 Agent。

> 这是一个独立模块。你可以直接打开文件或网址，也可以从项目带着上下文进入。

## 快速开始

1. 打开本地 HTML、Markdown，或输入开发服务器地址。
2. 点击「选取」，定位需要调整的元素或文档段落。
3. 写下意见，查看上下文，再选择目标 Agent。

## 模块能力

| 内容 | 阅读与检查 | 协作 |
| --- | --- | --- |
| 网页 | 导航、历史、查找、视口、开发工具 | 元素抓取、截图、自动操作 |
| HTML | 相对资源、刷新、源码切换 | 页面批注、导出 |
| Markdown | GFM、目录、相对链接、源码 | 段落批注、行号定位 |

## 配置示例

\`\`\`json
{
  "renderer": "markdown",
  "theme": "system",
  "agentDelivery": "explicit"
}
\`\`\`

## 验收清单

- [x] 独立入口与会话
- [x] 统一批注和上下文交付
- [ ] 原生内核、真实登录与远程联调

## 资源与边界

本地资源仅在授权目录内读取。网页脚本无法访问应用 IPC。源码位置只在可可靠识别时展示。
`;
export const featureGroups = [
  {
    title: "浏览与导航",
    items: [
      "多标签 / 关闭恢复",
      "地址历史 / 搜索",
      "前进后退 / 强制刷新",
      "页面查找 / 链接路由",
    ],
  },
  {
    title: "预览与阅读",
    items: [
      "HTML / 相对资源",
      "Markdown / GFM",
      "源码 / 目录 / 行号",
      "桌面 / 移动视口",
    ],
  },
  {
    title: "检查与反馈",
    items: [
      "元素 / 段落抓取",
      "CSS / DOM / 源码线索",
      "视口 / 元素 / 整页截图",
      "批注 / 复制 / Agent 交付",
    ],
  },
  {
    title: "会话与工具",
    items: [
      "Profile / Cookie 导入",
      "下载 / 开发工具",
      "Agent 自动浏览",
      "远程网络 / 服务端渲染",
      "产物分享 / 导出",
    ],
  },
];
