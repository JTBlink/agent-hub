import { renderToStaticMarkup } from "react-dom/server";
import {
  ArrowRight,
  Plus,
  Monitor,
  Smartphone,
  Check,
  Layers,
  Clock,
  Code2,
  ChevronRight,
} from "lucide-react";
export function DemoPage({
  onNavigate,
  onDownload,
}: {
  onNavigate: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="pv-demo">
      <div className="pv-demo-nav">
        <strong>
          <Layers size={20} /> Orbit
        </strong>
        <div>
          <button className="active">概览</button>
          <button onClick={onNavigate}>项目</button>
          <button onClick={onDownload}>报告</button>
        </div>
        <span className="pv-demo-label">页面预览</span>
      </div>
      <div className="pv-demo-body">
        <div className="pv-demo-breadcrumb">
          工作空间 <ChevronRight size={12} /> 概览
        </div>
        <div className="pv-demo-heading">
          <div>
            <span className="pv-demo-date">你的开发工作台</span>
            <h1 data-pick id="workspace-heading">
              每个想法，都有进展。
            </h1>
            <p data-pick>从一个清晰的工作空间，开始今天的创造。</p>
          </div>
          <button
            data-pick
            id="create-project"
            className="pv-demo-cta"
            onClick={onNavigate}
          >
            <Plus size={16} />
            新建项目
          </button>
        </div>
        <div className="pv-demo-stats">
          {[
            {
              label: "进行中项目",
              value: "08",
              caption: "本周新增 2 个",
              icon: <Layers size={17} />,
            },
            {
              label: "已完成任务",
              value: "24",
              caption: "比上周多完成 6 个",
              icon: <Check size={17} />,
            },
            {
              label: "专注时间",
              value: "16.5",
              caption: "小时 / 本周",
              icon: <Clock size={17} />,
            },
          ].map((item) => (
            <div data-pick className="pv-stat" key={item.label}>
              <div>
                {item.label}
                {item.icon}
              </div>
              <strong>{item.value}</strong>
              <small>{item.caption}</small>
            </div>
          ))}
        </div>
        <div className="pv-demo-section">
          <h2 data-pick>最近项目</h2>
          <button onClick={onNavigate}>
            查看全部 <ArrowRight size={14} />
          </button>
        </div>
        <div className="pv-projects">
          {[
            {
              title: "Workspace redesign",
              text: "让工作空间更有条理",
              state: "进行中",
              progress: 72,
              icon: <Layers size={21} />,
            },
            {
              title: "Developer portal",
              text: "连接工具、文档与团队",
              state: "待评审",
              progress: 94,
              icon: <Code2 size={21} />,
            },
          ].map((item) => (
            <article data-pick className="pv-project" key={item.title}>
              <div className="pv-project-heading">
                <span className="pv-project-icon">{item.icon}</span>
                <span className="pv-project-state">{item.state}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <div className="pv-progress">
                <span style={{ width: `${item.progress}%` }} />
              </div>
              <footer>
                <span>完成进度</span>
                <strong>{item.progress}%</strong>
              </footer>
            </article>
          ))}
        </div>
        <div className="pv-demo-section">
          <h2>最近动态</h2>
          <span>今天</span>
        </div>
        <div className="pv-activity" data-pick>
          <span className="pv-activity-check">
            <Check size={14} />
          </span>
          <div>
            <strong>导航布局已完成更新</strong>
            <p>Workspace redesign · 12 分钟前</p>
          </div>
          <span className="pv-project-state">已完成</span>
        </div>
        <div className="pv-demo-footnote">
          页面内所有元素均可选取，试试「新建项目」按钮。
        </div>
      </div>
    </div>
  );
}
export function HtmlExamplePage() {
  return (
    <>
      <style>{htmlExampleStyles}</style>
      <div className="pv-html-example">
        <div className="pv-html-example-top">
          <Layers size={28} />
          <strong>HTML 预览</strong>
        </div>
        <div className="pv-html-example-card" data-pick>
          <span className="pv-html-example-icon">
            <Code2 size={32} />
          </span>
          <h1 data-pick>本地页面，直接查看</h1>
          <p data-pick>查看布局与样式，为具体页面元素添加批注。</p>
          <div className="pv-html-example-illustration">
            <Monitor size={100} />
            <Smartphone size={61} />
            <span>
              <Check size={22} />
            </span>
          </div>
          <button
            data-pick
            id="preview-action"
            onClick={() => {
              const hint = document.getElementById("preview-hint");
              if (hint)
                hint.textContent = "已查看示例说明，可用「选取」检查页面元素。";
            }}
          >
            查看预览说明 <ArrowRight size={16} />
          </button>
          <small id="preview-hint">HTML 示例 · 可选取元素并添加批注</small>
        </div>
        <footer>本地 HTML · 独立预览与浏览</footer>
      </div>
    </>
  );
}

const htmlExampleStyles = `.pv-html-example {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 35px 20px;
  background: var(--color-accent-bg, #eef5ff);
}
.pv-html-example-top {
  display: flex;
  align-items: center;
  gap: 11px;
  color: var(--color-accent, #4f79d6);
  font-size: 17px;
  margin-bottom: 30px;
}
.pv-html-example-top strong {
  font-weight: 500;
}
.pv-html-example-card {
  width: 100%;
  max-width: 380px;
  padding: 29px;
  background: var(--color-bg, #fff);
  border: 1px solid var(--pv-line, #d7dde7);
  border-radius: 12px;
  text-align: center;
}
.pv-html-example-icon {
  display: inline-flex;
  padding: 14px;
  border-radius: 16px;
  color: var(--color-accent, #4f79d6);
  background: var(--color-accent-bg, #eef5ff);
}
.pv-html-example-card h1 {
  font-size: 25px;
  font-weight: 500;
  margin: 20px 0 9px;
}
.pv-html-example-card p {
  font-size: 11px;
  color: var(--color-text-muted, #667085);
}
.pv-html-example-illustration {
  height: 170px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--color-accent, #4f79d6);
  position: relative;
}
.pv-html-example-illustration > span {
  position: absolute;
  left: 50%;
  top: 65px;
  border: 6px solid var(--color-bg, #fff);
  padding: 6px;
  border-radius: 100%;
  background: var(--color-success-bg, #e3f4ec);
  color: var(--color-success, #0e9f6e);
}
.pv-html-example-card > button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--color-accent, #4f79d6);
  color: var(--color-on-accent, #fff);
  border-radius: 6px;
  padding: 12px;
  font-size: 13px;
}
.pv-html-example-card > small {
  display: block;
  margin-top: 15px;
  font-size: 9px;
  color: var(--color-text-muted, #667085);
}
.pv-html-example > footer {
  margin-top: 26px;
  font-size: 10px;
  color: var(--color-text-muted, #667085);
}

.pv-html-example { color: var(--color-text-primary, #172033); font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.5; }
.pv-html-example, .pv-html-example * { box-sizing: border-box; }
`;

export const htmlExampleDocument = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HTML 预览示例</title></head><body style="margin:0;min-height:100vh">${renderToStaticMarkup(<HtmlExamplePage />)}</body></html>`;
