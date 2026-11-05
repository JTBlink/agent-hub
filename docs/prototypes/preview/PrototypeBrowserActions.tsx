import { MessageSquareText, FileCode2 } from "lucide-react";
import "@vscode/codicons/dist/codicon.css";
import { CardActionMenu } from "../../../src/components/CardActionMenu";
import { Button } from "./prototypeShared";
import type { PreviewModel } from "./usePreviewModel";
export function PrototypeBrowserActions({ model }: { model: PreviewModel }) {
  const {
    active,
    source,
    setSource,
    setPicking,
    panelOpen,
    setPanelOpen,
    panel,
    setPanel,
    devtools,
    setDevtools,
    openPanel,
  } = model;
  return (
    <div className="pv-browser-tools" aria-label="页面工具">
      {active?.kind !== "web" && (
        <Button
          label={source ? "返回预览" : "查看源码"}
          active={source}
          onClick={() => {
            setSource(!source);
            setPicking(false);
          }}
        >
          <FileCode2 size={16} />
        </Button>
      )}
      <Button
        label="开发工具（演示）"
        active={devtools}
        onClick={() => setDevtools(!devtools)}
      >
        <span className="codicon codicon-tools" aria-hidden="true" />
      </Button>
      <Button
        label="检查与批注"
        active={panelOpen && panel === "feedback"}
        onClick={() => {
          setPanel("feedback");
          setPanelOpen(!(panelOpen && panel === "feedback"));
        }}
      >
        <MessageSquareText size={16} />
      </Button>
      <CardActionMenu
        label="更多操作"
        triggerClassName="pv-icon"
        actions={[
          {
            key: "open",
            label: "打开文件",
            onSelect: () => model.fileInput.current?.click(),
          },
          {
            key: "viewport",
            label: model.mobile ? "恢复自适应视口" : "移动视口 · 390 × 844",
            onSelect: () => model.setMobile(!model.mobile),
          },
          {
            key: "find",
            label: "页面查找",
            onSelect: () => model.setFindOpen(!model.findOpen),
          },
          {
            key: "history",
            label: "浏览历史",
            onSelect: () => openPanel("history"),
          },
          {
            key: "downloads",
            label: "下载",
            onSelect: () => openPanel("downloads"),
          },
          {
            key: "profiles",
            label: "浏览配置（演示）",
            onSelect: () => openPanel("profiles"),
          },
          { key: "restore", label: "恢复关闭的标签", onSelect: model.reopen },
        ]}
      />
    </div>
  );
}
