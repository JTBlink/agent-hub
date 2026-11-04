import {
  X,
  MousePointer2,
  Camera,
  Copy,
  Send,
  Check,
  Download,
  FolderOpen,
  Clock,
  Shield,
  Trash2,
  Zap,
} from "lucide-react";
import { Button, KindIcon } from "./prototypeShared";
import { captureText } from "./previewFormat";
import { featureGroups } from "./fixtures";
import type { Panel } from "./previewFormat";
import type { PreviewModel } from "./usePreviewModel";
export function PrototypeInspector({ model }: { model: PreviewModel }) {
  const {
    closed,
    panel,
    setPanelOpen,
    setPicking,
    setCaptures,
    selected,
    setSelected,
    setSource,
    setSourceLine,
    devtools,
    setDevtools,
    profiles,
    setProfiles,
    profileName,
    setProfileName,
    remote,
    setRemote,
    remoteHost,
    setRemoteHost,
    renderOn,
    setRenderOn,
    linkRouting,
    setLinkRouting,
    setAgentLog,
    automation,
    setAutomation,
    downloads,
    setDownloads,
    cookieInput,
    active,
    current,
    pageCaptures,
    notify,
    switchVariant,
    go,
    updateTab,
    restoreTab,
    copy,
    sendPreview,
  } = model;
  const panelTitles: Record<Panel, string> = {
    feedback: "检查与批注",
    history: "浏览历史",
    downloads: "下载与导出",
    profiles: "登录配置",
    automation: "Agent 自动浏览",
    remote: "远程与链接",
    capabilities: "完整能力地图",
  };
  return (
    <>
      <div className="pv-panel-heading">
        <div>
          <span className="pv-eyebrow">当前页面</span>
          <h2>{panelTitles[panel]}</h2>
        </div>
        <Button label="关闭侧栏" onClick={() => setPanelOpen(false)}>
          <X size={16} />
        </Button>
      </div>
      {panel === "feedback" && (
        <>
          <div className="pv-panel-tabs">
            <button className="active" onClick={() => setSelected(null)}>
              批注 <span>{pageCaptures.length}</span>
            </button>
            <button onClick={() => setDevtools(!devtools)}>页面信息</button>
          </div>
          <div className="pv-panel-scroll">
            {!pageCaptures.length && (
              <div className="pv-empty">
                <MousePointer2 size={28} />
                <h3>把问题指给 Agent 看</h3>
                <p>选中页面元素或文档段落，附上修改意见，保留准确的上下文。</p>
                <button
                  className="pv-primary"
                  onClick={() => {
                    setPicking(true);
                    setSource(false);
                  }}
                >
                  开始选取
                </button>
                <div className="pv-shortcuts">
                  <span>
                    <kbd>C</kbd> 复制元素
                  </span>
                  <span>
                    <kbd>S</kbd> 截图
                  </span>
                  <span>
                    <kbd>Esc</kbd> 退出
                  </span>
                </div>
              </div>
            )}
            {pageCaptures.map((item, index) => (
              <article
                className={`pv-capture ${selected === item.id ? "selected" : ""}`}
                key={item.id}
              >
                <div className="pv-capture-title">
                  <button onClick={() => setSelected(item.id)}>
                    <span className="pv-count">{index + 1}</span>
                    <code>{item.selector}</code>
                  </button>
                  <Button
                    label="删除批注"
                    onClick={() => {
                      setCaptures((previous) =>
                        previous.filter((entry) => entry.id !== item.id),
                      );
                      if (selected === item.id) setSelected(null);
                    }}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
                {item.screenshot && (
                  <div className="pv-snapshot">
                    <Camera size={18} />
                    <span>
                      元素截图示意 · {item.width} × {item.height}
                    </span>
                  </div>
                )}
                <p>{item.text.slice(0, 120)}</p>
                <textarea
                  aria-label={`批注 ${index + 1}`}
                  placeholder="希望这里怎么改？"
                  value={item.note}
                  onChange={(event) =>
                    setCaptures((previous) =>
                      previous.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, note: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
                <div className="pv-capture-meta">
                  <span>
                    {item.width} × {item.height}
                  </span>
                  <button onClick={() => void copy(captureText([item]))}>
                    <Copy size={12} />
                    复制
                  </button>
                </div>
              </article>
            ))}
            {current && (
              <details className="pv-context" open>
                <summary>已抓取的 DOM 与样式</summary>
                <pre>{current.html}</pre>
                <pre>{current.styles}</pre>
                {current.source ? (
                  <button
                    className="pv-secondary"
                    onClick={() => {
                      setSourceLine(Number(current.source?.split(":").at(-1)));
                      setSource(true);
                    }}
                  >
                    {current.source} · 查看源码
                  </button>
                ) : (
                  <small>源码位置：未可靠识别</small>
                )}
              </details>
            )}
          </div>
          <div className="pv-panel-footer">
            <div className="pv-subtle">只发送当前页面的批注</div>
            <button
              className="pv-primary"
              disabled={!pageCaptures.length}
              onClick={sendPreview}
            >
              <Send size={15} />
              交给 Agent <span>{pageCaptures.length || ""}</span>
            </button>
          </div>
        </>
      )}
      {panel === "history" && (
        <div className="pv-panel-scroll">
          <h3>当前标签</h3>
          {active?.history.map((url, index) => (
            <button
              key={`${url}-${index}`}
              className="pv-history"
              onClick={() => go(index - active.cursor)}
            >
              <Clock size={14} />
              <span>{url}</span>
              {index === active.cursor && <Check size={14} />}
            </button>
          ))}
          <h3>最近关闭</h3>
          {closed.length ? (
            closed.map((tab) => (
              <button
                key={tab.id}
                className="pv-history"
                onClick={() => restoreTab(tab.id)}
              >
                <KindIcon kind={tab.kind} />
                {tab.title}
                <span>恢复</span>
              </button>
            ))
          ) : (
            <p className="pv-subtle">关闭标签后可在此恢复。</p>
          )}
        </div>
      )}
      {panel === "downloads" && (
        <div className="pv-panel-scroll">
          <p className="pv-subtle">
            原型中的导出会真实下载；网页下载队列以演示数据展示。
          </p>
          <button
            className="pv-secondary"
            onClick={() =>
              setDownloads((previous) => [
                ...previous,
                {
                  id: Date.now(),
                  name: "design-assets.zip",
                  state: "下载中（演示）",
                },
              ])
            }
          >
            <Download size={14} />
            演示网页下载
          </button>
          {downloads.map((item) => (
            <div className="pv-download" key={item.id}>
              <Download size={20} />
              <div>
                <strong>{item.name}</strong>
                <small>{item.state}</small>
              </div>
              <button
                onClick={() =>
                  setDownloads((previous) =>
                    previous.filter((entry) => entry.id !== item.id),
                  )
                }
              >
                {item.state.includes("下载中") ? "取消" : "移除"}
              </button>
            </div>
          ))}
        </div>
      )}
      {panel === "profiles" && (
        <div className="pv-panel-scroll">
          <p className="pv-subtle">
            每个配置拥有独立
            Cookie、缓存与站点存储。切换配置会在正式实现中重新打开页面。
          </p>
          {profiles.map((name) => (
            <button
              className={`pv-profile ${active?.profile === name ? "selected" : ""}`}
              key={name}
              onClick={() => {
                updateTab({ profile: name });
                notify("已切换演示配置；未读取任何真实登录态");
              }}
            >
              <Shield size={20} />
              <span>
                <strong>{name}</strong>
                <small>
                  {name === "访客会话" ? "退出后清理" : "独立持久会话"}
                </small>
              </span>
              {active?.profile === name && <Check size={15} />}
            </button>
          ))}
          <label className="pv-field">
            新建配置
            <input
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="例如：测试账号"
            />
          </label>
          <button
            className="pv-secondary"
            disabled={
              !profileName.trim() || profiles.includes(profileName.trim())
            }
            onClick={() => {
              setProfiles((previous) => [...previous, profileName.trim()]);
              setProfileName("");
            }}
          >
            创建配置
          </button>
          <hr />
          <h3>导入 Cookie</h3>
          <p className="pv-subtle">
            正式版支持浏览器或文件导入。无法迁移的登录需直接登录；导入前按域名展示替换范围。
          </p>
          <button
            className="pv-secondary"
            onClick={() => cookieInput.current?.click()}
          >
            <FolderOpen size={14} />
            选择 JSON 文件（演示）
          </button>
          <p className="pv-note">原型只校验文件结构，不保存或发送 Cookie。</p>
        </div>
      )}
      {panel === "automation" && (
        <div className="pv-panel-scroll">
          <div className="pv-badge">
            <Zap size={13} />
            与手动浏览使用同一页面会话
          </div>
          <h3>告诉 Agent 要检查什么</h3>
          <textarea
            aria-label="自动浏览任务"
            rows={5}
            value={automation}
            onChange={(event) => setAutomation(event.target.value)}
            placeholder="打开移动视口，检查操作按钮是否可点击，并截图记录结果。"
          />
          <button
            className="pv-primary"
            disabled={!automation.trim()}
            onClick={() => {
              setAgentLog((previous) => [
                ...previous,
                `自动浏览任务草稿：${automation}`,
                "演示计划：snapshot → 检查元素 → 点击 → 截图。尚未执行任何浏览器操作。",
              ]);
              switchVariant("C");
            }}
          >
            <Zap size={14} />
            预览执行计划
          </button>
          <h3>浏览能力</h3>
          <div className="pv-command-list">
            snapshot · click · fill · scroll · navigate · screenshot · cookies ·
            storage · tabs
          </div>
          <p className="pv-subtle">
            实际执行状态应区分运行中、等待人工、失败和结果不明。登录或敏感操作按目标任务授权处理。
          </p>
        </div>
      )}
      {panel === "remote" && (
        <div className="pv-panel-scroll">
          <h3>页面网络位置</h3>
          {["本机", "SSH 工作空间", "远程服务"].map((name) => (
            <button
              key={name}
              className={`pv-choice ${remote === name ? "selected" : ""}`}
              onClick={() => setRemote(name)}
            >
              {name}
              {remote === name && <Check size={14} />}
            </button>
          ))}
          {remote !== "本机" && (
            <label className="pv-field">
              目标主机
              <input
                value={remoteHost}
                onChange={(event) => setRemoteHost(event.target.value)}
              />
            </label>
          )}
          <h3>页面渲染位置</h3>
          {["本机渲染", "服务端渲染 / 画面流"].map((name) => (
            <button
              key={name}
              className={`pv-choice ${renderOn === name ? "selected" : ""}`}
              onClick={() => setRenderOn(name)}
            >
              {name}
              {renderOn === name && <Check size={14} />}
            </button>
          ))}
          <p className="pv-note">
            当前为配置演示，未建立远程连接。正式版变更仅作用于新页面，页面标明网络与渲染位置。
          </p>
          <h3>终端与文档链接</h3>
          {["模块内打开", "系统浏览器"].map((name) => (
            <button
              key={name}
              className={`pv-choice ${linkRouting === name ? "selected" : ""}`}
              onClick={() => setLinkRouting(name)}
            >
              {name}
              {linkRouting === name && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
      {panel === "capabilities" && (
        <div className="pv-panel-scroll">
          <p className="pv-subtle">
            完整对齐范围；以下入口均在本原型有对应交互。原生引擎与外部服务不在此演示中执行。
          </p>
          {featureGroups.map((group) => (
            <section className="pv-feature-group" key={group.title}>
              <h3>{group.title}</h3>
              {group.items.map((item) => (
                <div key={item}>
                  <Check size={13} />
                  {item}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
