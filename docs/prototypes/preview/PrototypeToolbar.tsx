import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Plus,
  X,
  PanelLeft,
  Search,
  Crosshair,
  Sun,
  Moon,
  Terminal,
} from "lucide-react";
import { CardActionMenu } from "../../../src/components/CardActionMenu";
import { Button, KindIcon } from "./prototypeShared";
import { PrototypeBrowserActions } from "./PrototypeBrowserActions";
import { variants } from "./previewFormat";
import type { PreviewModel } from "./usePreviewModel";

export function PrototypeToolbar({ model }: { model: PreviewModel }) {
  const {
    tabs,
    activeId,
    active,
    address,
    setAddress,
    picking,
    setPicking,
    pickIntent,
    setHover,
    setModal,
    reloading,
    libraryOpen,
    setLibraryOpen,
    dark,
    setDark,
    findOpen,
    setFindOpen,
    query,
    changeQuery,
    findMatches,
    findIndex,
    setFindIndex,
    content,
    selectTab,
    closeTab,
    navigate,
    go,
    reload,
    switchVariant,
    openPanel,
    variant,
  } = model;
  return (
    <>
      <div className="pv-tabbar">
        <Button
          label={libraryOpen ? "收起资源与工具" : "展开资源与工具"}
          active={libraryOpen}
          onClick={() => setLibraryOpen(!libraryOpen)}
        >
          <PanelLeft size={17} />
        </Button>
        <div className="pv-tabs" role="tablist" aria-label="预览标签">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`pv-tab ${activeId === tab.id ? "active" : ""}`}
            >
              <button
                role="tab"
                aria-selected={activeId === tab.id}
                onClick={() => selectTab(tab)}
              >
                <KindIcon kind={tab.kind} />
                <span>{tab.title}</span>
              </button>
              <button
                aria-label={`关闭 ${tab.title}`}
                onClick={() => closeTab(tab.id)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <Button label="新建标签" onClick={() => setModal("new")}>
            <Plus size={17} />
          </Button>
        </div>
        <span className="pv-prototype-label">交互原型</span>
        <CardActionMenu
          label="预览命令与布局"
          triggerClassName="pv-icon"
          triggerIcon={<Terminal size={17} />}
          actions={[
            ...(["A", "B", "C"] as const).map((key) => ({
              key,
              label: `${key === variant ? "✓ " : ""}方案 ${key} · ${variants[key]}`,
              onSelect: () => switchVariant(key),
            })),
            {
              key: "automation",
              label: "Agent 自动浏览（演示）",
              separatorBefore: true,
              onSelect: () => openPanel("automation"),
            },
            {
              key: "capabilities",
              label: "完整能力地图",
              onSelect: () => openPanel("capabilities"),
            },
          ]}
        />
        <Button
          label={dark ? "浅色主题" : "深色主题"}
          onClick={() => setDark(!dark)}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
      </div>
      <div className="pv-addressbar">
        <Button
          label="后退"
          disabled={!active || active.cursor === 0}
          onClick={() => go(-1)}
        >
          <ArrowLeft size={17} />
        </Button>
        <Button
          label="前进"
          disabled={!active || active.cursor >= active.history.length - 1}
          onClick={() => go(1)}
        >
          <ArrowRight size={17} />
        </Button>
        <Button label="刷新" disabled={!active} onClick={reload}>
          <RotateCw size={17} className={reloading ? "pv-spin" : ""} />
        </Button>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            navigate(address);
          }}
        >
          <KindIcon kind={active?.kind ?? "web"} />
          <input
            aria-label="网址或文件地址"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="输入网址或打开文件"
          />
        </form>
        <PrototypeBrowserActions model={model} />
      </div>
      {findOpen && (
        <div className="pv-find">
          <Search size={14} />
          <input
            autoFocus
            aria-label="查找页面内容"
            placeholder="查找页面内容"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
          />
          <span>
            {query
              ? `${findMatches ? (findIndex % findMatches) + 1 : 0} / ${findMatches}`
              : ""}
          </span>
          <button
            onClick={() => {
              setFindIndex((previous) => previous + 1);
              const matches = Array.from(
                content.current?.querySelectorAll<HTMLElement>(
                  "p,h1,h2,h3,li,td,[data-pick]",
                ) ?? [],
              ).filter(
                (element) =>
                  query &&
                  element.textContent
                    ?.toLowerCase()
                    .includes(query.toLowerCase()),
              );
              matches[
                (findIndex + 1) % Math.max(matches.length, 1)
              ]?.scrollIntoView({ block: "center", behavior: "smooth" });
            }}
          >
            下一个
          </button>
          <Button label="关闭查找" onClick={() => setFindOpen(false)}>
            <X size={14} />
          </Button>
        </div>
      )}
      {picking && (
        <div className="pv-picker-hint" role="status">
          <Crosshair size={15} />
          <span>
            {pickIntent === "copy" ? (
              <>
                单击元素复制，或悬停后按 <kbd>C</kbd> 复制、<kbd>S</kbd>{" "}
                查看截图演示
              </>
            ) : (
              <>点击页面元素或文档段落，添加修改意见</>
            )}
          </span>
          <button
            onClick={() => {
              setPicking(false);
              setHover(null);
            }}
          >
            取消 <kbd>Esc</kbd>
          </button>
        </div>
      )}
    </>
  );
}
