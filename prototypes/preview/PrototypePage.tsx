import { X, Globe, FileText } from "lucide-react";
import { Button } from "./prototypeShared";

import { PrototypeMarkdown } from "./PrototypeMarkdown";
import { CodeEditor } from "../../src/components/file-reader/CodeEditor";
import {
  DemoPage,
  HtmlExamplePage,
  htmlExampleDocument,
} from "./PrototypeExamples";
import type { PreviewModel } from "./usePreviewModel";
export function PrototypePage({ model }: { model: PreviewModel }) {
  const {
    picking,
    setHover,
    source,
    sourceLine,
    md,
    setMd,
    customHtml,
    setCustomHtml,
    mobile,
    setModal,
    devtools,
    setDevtools,
    toolTab,
    setToolTab,
    setDownloads,
    content,
    stage,
    active,
    current,
    openPanel,
    navigate,
    grab,
  } = model;
  return (
    <div className="pv-browser-column">
      <div className={`pv-stage ${mobile ? "mobile" : ""}`} ref={stage}>
        {!active ? (
          <div className="pv-empty">
            <Globe size={38} />
            <h2>打开一个页面，开始检查</h2>
            <p>支持网页、本地 HTML 和 Markdown。</p>
            <button className="pv-primary" onClick={() => setModal("new")}>
              打开内容
            </button>
          </div>
        ) : (
          <div
            className={`pv-document ${picking ? "picking" : ""} ${active.kind === "markdown" ? "is-markdown" : ""}`}
            ref={content}
            onMouseMove={(event) => {
              if (!picking) return;
              const element = (
                event.target as HTMLElement
              ).closest<HTMLElement>(
                "[data-pick],h1,h2,h3,p,li,td,pre,blockquote",
              );
              if (!element) {
                setHover(null);
                return;
              }
              const rect = element.getBoundingClientRect();
              setHover({
                x: rect.x,
                y: rect.y,
                w: rect.width,
                h: rect.height,
                label: `${element.tagName.toLowerCase()} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`,
              });
            }}
            onMouseLeave={() => setHover(null)}
            onScrollCapture={() => setHover(null)}
            onClickCapture={(event) => {
              if (!picking) return;
              event.preventDefault();
              event.stopPropagation();
              const element = (
                event.target as HTMLElement
              ).closest<HTMLElement>(
                "[data-pick],h1,h2,h3,p,li,td,pre,blockquote",
              );
              if (element) grab(element);
            }}
          >
            {source ? (
              <CodeEditor
                file={{
                  path: active.title,
                  content:
                    active.kind === "markdown"
                      ? md
                      : (customHtml ?? htmlExampleDocument),
                }}
                wrap
                location={
                  sourceLine
                    ? { line: sourceLine, column: 1, endColumn: 1 }
                    : undefined
                }
                onChange={(text) =>
                  active.kind === "markdown" ? setMd(text) : setCustomHtml(text)
                }
              />
            ) : active.kind === "markdown" ? (
              <div className="pv-md-layout">
                <div className="pv-md">
                  <div className="pv-document-meta">
                    <FileText size={14} /> docs / README.md{" "}
                    <span>Markdown</span>
                  </div>
                  <PrototypeMarkdown content={md} />
                </div>
                <nav className="pv-toc" aria-label="文档目录">
                  <span>本页目录</span>
                  {Array.from(md.matchAll(/^## (.+)$/gm)).map((match) => (
                    <button
                      key={match[1]}
                      onClick={() => {
                        const heading = Array.from(
                          content.current?.querySelectorAll("h2") ?? [],
                        ).find((element) => element.textContent === match[1]);
                        heading?.scrollIntoView({
                          behavior: "smooth",
                        });
                      }}
                    >
                      {match[1]}
                    </button>
                  ))}
                </nav>
              </div>
            ) : active.kind === "html" ? (
              customHtml ? (
                <div className="pv-imported">
                  <div className="pv-note">
                    本地单文件预览 ·
                    隔离模式，不执行脚本；相对资源与跨帧选取待原生宿主接入
                  </div>
                  <iframe
                    title="导入的 HTML 预览"
                    sandbox=""
                    srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'">${customHtml}`}
                  />
                </div>
              ) : (
                <HtmlExamplePage />
              )
            ) : (
              <DemoPage
                onNavigate={() => navigate("http://localhost:3000/projects")}
                onDownload={() => {
                  openPanel("downloads");
                  setDownloads((previous) => [
                    ...previous,
                    {
                      id: Date.now(),
                      name: "workspace-report.pdf",
                      state: "下载中（演示）",
                    },
                  ]);
                }}
              />
            )}
          </div>
        )}
      </div>
      {devtools && (
        <div className="pv-devtools">
          <div>
            <span className="pv-badge">工具面板示意</span>
            {["Console", "Elements", "Network"].map((name) => (
              <button
                className={toolTab === name ? "active" : ""}
                key={name}
                onClick={() => setToolTab(name)}
              >
                {name}
              </button>
            ))}
            <Button label="关闭开发工具" onClick={() => setDevtools(false)}>
              <X size={14} />
            </Button>
          </div>
          <pre>
            {toolTab === "Console"
              ? "> 页面已挂载\n  原型不连接原生浏览器调试协议。"
              : toolTab === "Elements"
                ? (current?.html ?? "选取元素后在此查看 DOM。")
                : "GET / 200 （演示）\nWS /hmr 101 （演示）"}
          </pre>
        </div>
      )}
    </div>
  );
}
