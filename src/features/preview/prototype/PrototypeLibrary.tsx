import { ThemedSelect } from "../../../components/ThemedSelect";
import {
  Plus,
  Globe,
  Download,
  Settings2,
  FolderOpen,
  Clock,
  Shield,
  Link2,
  BookOpen,
  Zap,
  CircleHelp,
} from "lucide-react";
import { Button, KindIcon } from "./prototypeShared";

import type { PreviewModel } from "./usePreviewModel";
export function PrototypeLibrary({ model }: { model: PreviewModel }) {
  const {
    tabs,
    activeId,
    setModal,
    downloads,
    association,
    setAssociation,
    fileInput,
    openPanel,
    selectTab,
    addTab,
  } = model;
  return (
    <>
      <nav className="pv-rail" aria-label="模块导航">
        <button className="pv-rail-active" title="预览与浏览">
          <Globe size={21} />
        </button>
        <button
          title="文件阅读"
          onClick={() => {
            const tab = tabs.find((entry) => entry.kind === "markdown");
            if (tab) selectTab(tab);
            else addTab("markdown", "workspace:///docs/README.md", "README.md");
          }}
        >
          <BookOpen size={21} />
        </button>
        <button title="Agent 自动浏览" onClick={() => openPanel("automation")}>
          <Zap size={21} />
        </button>
        <div className="pv-rail-spacer" />
        <button title="完整能力地图" onClick={() => openPanel("capabilities")}>
          <CircleHelp size={21} />
        </button>
        <button title="远程与设置" onClick={() => openPanel("remote")}>
          <Settings2 size={21} />
        </button>
      </nav>
      <aside className="pv-library">
        <div className="pv-library-title">
          <strong>预览与浏览</strong>
          <Button label="打开内容" onClick={() => setModal("new")}>
            <Plus size={16} />
          </Button>
        </div>
        <button
          className="pv-open-file"
          onClick={() => fileInput.current?.click()}
        >
          <FolderOpen size={15} />
          打开文件 <span>↗</span>
        </button>
        <div className="pv-section-label">
          已打开 <span>{tabs.length}</span>
        </div>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`pv-library-item ${activeId === tab.id ? "active" : ""}`}
            onClick={() => selectTab(tab)}
          >
            <KindIcon kind={tab.kind} />
            <span>{tab.title}</span>
          </button>
        ))}
        <div className="pv-section-label">工具</div>
        {(
          [
            { id: "history", icon: <Clock size={15} />, label: "浏览历史" },
            { id: "profiles", icon: <Shield size={15} />, label: "登录配置" },
            {
              id: "downloads",
              icon: <Download size={15} />,
              label: "下载与导出",
            },
            { id: "remote", icon: <Link2 size={15} />, label: "远程与链接" },
          ] as const
        ).map((item) => (
          <button
            className="pv-library-item"
            key={item.id}
            onClick={() => openPanel(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.id === "downloads" && downloads.length > 0 && (
              <small>{downloads.length}</small>
            )}
          </button>
        ))}
        <div className="pv-library-bottom">
          <label>
            可选项目关联
            <ThemedSelect
              aria-label="可选项目关联"
              value={association}
              onChange={(event) => setAssociation(event.target.value)}
            >
              <option>未关联项目</option>
              <option>demo / main</option>
              <option>demo / feature-preview</option>
            </ThemedSelect>
          </label>
          <p>会话由本模块管理，项目关联只提供上下文。</p>
        </div>
      </aside>
    </>
  );
}
