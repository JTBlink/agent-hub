import {
  Crosshair,
  MessageSquarePlus,
  Camera,
  Code2,
  Share2,
  ExternalLink,
  Download,
  FolderOpen,
} from "lucide-react";
import { CardActionMenu } from "../../../src/components/CardActionMenu";
import { Button } from "./prototypeShared";
import type { PreviewModel } from "./usePreviewModel";

export function PrototypeBrowserActions({ model }: { model: PreviewModel }) {
  const {
    active,
    source,
    setSource,
    customHtml,
    picking,
    setPicking,
    setHover,
    pickIntent,
    startPicking,
    pageCaptures,
    setModal,
    fileInput,
    openPanel,
    mobile,
    setMobile,
    findOpen,
    setFindOpen,
    panelOpen,
    setPanelOpen,
    setPanel,
    devtools,
    setDevtools,
    reload,
    reopen,
    notify,
  } = model;
  const cannotPick =
    !active || source || (!!customHtml && active.kind === "html");
  const sourceAction = () => {
    setSource(!source);
    setPicking(false);
    setHover(null);
  };
  const externalAction = () =>
    notify("原型仅演示系统浏览器入口，不访问外部页面");
  return (
    <div className="pv-browser-tools" aria-label="页面工具">
      <button
        className="pv-import-action"
        aria-label={
          active?.kind === "web" ? "导入 Cookie（演示）" : "打开本地文件"
        }
        disabled={!active}
        onClick={() =>
          active?.kind === "web"
            ? openPanel("profiles")
            : fileInput.current?.click()
        }
        title={
          active?.kind === "web"
            ? "导入 Cookie（演示）"
            : "打开本地 Markdown 或 HTML"
        }
      >
        {active?.kind === "web" ? (
          <Download size={16} />
        ) : (
          <FolderOpen size={16} />
        )}
        <span>{active?.kind === "web" ? "导入" : "打开文件"}</span>
      </button>
      <Button
        label="抓取页面元素"
        active={picking && pickIntent === "copy"}
        disabled={cannotPick}
        onClick={() => startPicking("copy")}
      >
        <Crosshair size={18} />
      </Button>
      <Button
        label="批注页面元素"
        active={picking && pickIntent === "annotate"}
        disabled={cannotPick}
        onClick={() => startPicking("annotate")}
      >
        <MessageSquarePlus size={18} />
        {pageCaptures.length > 0 && (
          <span className="pv-annotation-count">{pageCaptures.length}</span>
        )}
      </Button>
      <Button
        label="截图（原型演示）"
        disabled={!active}
        onClick={() => setModal("screenshot")}
      >
        <Camera size={18} />
      </Button>
      <span className="pv-secondary-tools">
        <Button
          label="分享与导出"
          disabled={!active}
          onClick={() => setModal("share")}
        >
          <Share2 size={17} />
        </Button>
        <Button
          label="查看源码"
          active={source}
          disabled={!active || active.kind === "web"}
          onClick={sourceAction}
        >
          <Code2 size={18} />
        </Button>
        <Button
          label="系统浏览器打开（演示）"
          disabled={!active}
          onClick={externalAction}
        >
          <ExternalLink size={17} />
        </Button>
      </span>
      <CardActionMenu
        label="更多操作"
        triggerClassName="pv-icon"
        actions={[
          {
            key: "open",
            label: "打开文件",
            onSelect: () => fileInput.current?.click(),
          },
          {
            key: "viewport",
            label: mobile ? "恢复自适应视口" : "移动视口 · 390 × 844",
            onSelect: () => setMobile(!mobile),
          },
          {
            key: "find",
            label: findOpen ? "关闭页面查找" : "页面查找",
            onSelect: () => setFindOpen(!findOpen),
          },
          {
            key: "source",
            label: source ? "返回预览" : "查看源码",
            disabled: !active || active.kind === "web",
            onSelect: sourceAction,
          },
          {
            key: "share",
            label: "分享与导出",
            disabled: !active,
            onSelect: () => setModal("share"),
          },
          {
            key: "external",
            label: "系统浏览器打开（演示）",
            disabled: !active,
            onSelect: externalAction,
          },
          {
            key: "inspector",
            label: panelOpen ? "收起检查与批注" : "检查与批注",
            separatorBefore: true,
            onSelect: () => {
              setPanel("feedback");
              setPanelOpen(!panelOpen);
            },
          },
          {
            key: "profiles",
            label: "浏览配置与 Cookie",
            onSelect: () => openPanel("profiles"),
          },
          {
            key: "history",
            label: "浏览历史",
            onSelect: () => openPanel("history"),
          },
          {
            key: "downloads",
            label: "下载与导出记录",
            onSelect: () => openPanel("downloads"),
          },
          {
            key: "remote",
            label: "网络与渲染位置",
            onSelect: () => openPanel("remote"),
          },
          {
            key: "devtools",
            label: devtools ? "关闭开发工具" : "开发工具（演示）",
            onSelect: () => setDevtools(!devtools),
          },
          { key: "reload", label: "强制刷新（演示）", onSelect: reload },
          { key: "reopen", label: "恢复关闭的标签", onSelect: reopen },
          {
            key: "automation",
            label: "Agent 自动浏览（演示）",
            onSelect: () => openPanel("automation"),
          },
        ]}
      />
    </div>
  );
}
