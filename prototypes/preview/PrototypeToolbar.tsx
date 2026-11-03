import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Plus,
  X,
  Globe,
  MousePointer2,
  Camera,
  PanelRight,
  Search,
  ExternalLink,
  Monitor,
  Smartphone,
  MoreHorizontal,
  ChevronDown,
  Shield,
  Code2,
  Share2,
} from "lucide-react";
import { Button, KindIcon } from "./prototypeShared";

import type { PreviewModel } from "./usePreviewModel";
export function PrototypeToolbar({ model }: { model: PreviewModel }) {
  const {
    tabs,
    activeId,
    address,
    setAddress,
    setPanel,
    panelOpen,
    setPanelOpen,
    picking,
    setPicking,
    setHover,
    source,
    setSource,
    customHtml,
    mobile,
    setMobile,
    findOpen,
    setFindOpen,
    query,
    findMatches,
    findIndex,
    setFindIndex,
    setModal,
    devtools,
    setDevtools,
    remote,
    remoteHost,
    reloading,
    menu,
    setMenu,
    content,
    active,
    notify,
    openPanel,
    selectTab,
    closeTab,
    reopen,
    navigate,
    go,
    reload,
    changeQuery,
  } = model;
  return (
    <>
      <div className="pv-tabbar" role="tablist" aria-label="预览标签">
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
      <div className="pv-addressbar">
        <Button
          label="后退"
          disabled={!active || active.cursor === 0}
          onClick={() => go(-1)}
        >
          <ArrowLeft size={16} />
        </Button>
        <Button
          label="前进"
          disabled={!active || active.cursor >= active.history.length - 1}
          onClick={() => go(1)}
        >
          <ArrowRight size={16} />
        </Button>
        <Button
          label="刷新；右侧更多可强制刷新"
          disabled={!active}
          onClick={reload}
        >
          <RotateCw size={16} className={reloading ? "pv-spin" : ""} />
        </Button>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            navigate(address);
          }}
        >
          <Globe size={14} />
          <input
            aria-label="网址或文件地址"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="输入网址、搜索内容或打开文件"
          />
          <span className="pv-address-hint">演示</span>
        </form>
        <button
          className="pv-profile-pill"
          onClick={() => openPanel("profiles")}
        >
          <Shield size={13} />
          {active?.profile ?? "开发环境"}
          <ChevronDown size={12} />
        </button>
        <Button
          label="系统浏览器打开（演示）"
          onClick={() =>
            notify("正式版通过系统 opener 打开；原型不访问外部页面")
          }
        >
          <ExternalLink size={16} />
        </Button>
      </div>
      <div className="pv-toolbar">
        <div className="pv-toolbar-left">
          <button
            className={`pv-tool ${picking ? "active" : ""}`}
            disabled={
              !active || source || (!!customHtml && active.kind === "html")
            }
            onClick={() => {
              setPicking(!picking);
              setHover(null);
            }}
          >
            <MousePointer2 size={15} />
            选取
          </button>
          <button
            className="pv-tool"
            disabled={!active}
            onClick={() => setModal("screenshot")}
          >
            <Camera size={15} />
            截图
          </button>
          <button
            className={`pv-tool ${source ? "active" : ""}`}
            disabled={!active || active.kind === "web"}
            onClick={() => {
              setSource(!source);
              setPicking(false);
              setHover(null);
            }}
          >
            <Code2 size={15} />
            源码
          </button>
          <span className="pv-divider" />
          <button
            className={`pv-tool ${mobile ? "active" : ""}`}
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <Smartphone size={15} /> : <Monitor size={15} />}
            <span>{mobile ? "390 × 844" : "自适应"}</span>
          </button>
          <Button
            label="页面查找"
            active={findOpen}
            onClick={() => setFindOpen(!findOpen)}
          >
            <Search size={15} />
          </Button>
        </div>
        <div className="pv-toolbar-right">
          <button className="pv-host" onClick={() => openPanel("remote")}>
            <span />
            {remote === "本机" ? "本机" : remoteHost}
          </button>
          <Button label="分享与导出" onClick={() => setModal("share")}>
            <Share2 size={15} />
          </Button>
          <Button
            label="检查与批注"
            active={panelOpen}
            onClick={() => {
              setPanel("feedback");
              setPanelOpen(!panelOpen);
            }}
          >
            <PanelRight size={15} />
          </Button>
          <div className="pv-menu-wrap">
            <Button
              label="更多操作"
              active={menu}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={17} />
            </Button>
            {menu && (
              <div className="pv-menu">
                {[
                  {
                    label: "强制刷新（演示）",
                    action: () => {
                      reload();
                      notify("已演示跳过缓存刷新");
                    },
                  },
                  { label: "恢复关闭的标签", action: reopen },
                  {
                    label: "开发工具",
                    action: () => setDevtools(!devtools),
                  },
                  {
                    label: "自动浏览",
                    action: () => openPanel("automation"),
                  },
                  {
                    label: "完整能力地图",
                    action: () => openPanel("capabilities"),
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      item.action();
                      setMenu(false);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {findOpen && (
        <div className="pv-find">
          <Search size={14} />
          <input
            autoFocus
            aria-label="查找页面内容"
            placeholder="查找页面内容"
            value={query}
            onChange={(event) => {
              changeQuery(event.target.value);
            }}
          />
          <span>
            {query
              ? `${findMatches ? (findIndex % findMatches) + 1 : 0} / ${findMatches}`
              : ""}
          </span>
          <button
            onClick={() => {
              setFindIndex((previous) => previous + 1);
              const elements = content.current?.querySelectorAll<HTMLElement>(
                "p,h1,h2,h3,li,td,[data-pick]",
              );
              const matches = Array.from(elements ?? []).filter(
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
        <div className="pv-picker-hint">
          <MousePointer2 size={14} />
          <span>
            点击元素或文档段落添加批注，<kbd>C</kbd> 复制，<kbd>S</kbd> 截图示意
          </span>
          <button
            onClick={() => {
              setPicking(false);
              setHover(null);
            }}
          >
            退出 <kbd>Esc</kbd>
          </button>
        </div>
      )}
    </>
  );
}
