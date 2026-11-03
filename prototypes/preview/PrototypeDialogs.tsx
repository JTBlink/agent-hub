import { htmlExampleDocument } from "./PrototypeExamples";
import { PrototypeDelivery } from "./PrototypeDelivery";
import { useEffect, useRef } from "react";
import {
  X,
  Globe,
  FileText,
  FileCode2,
  Camera,
  Download,
  FolderOpen,
  Link2,
} from "lucide-react";
import { Button } from "./prototypeShared";
import { captureText } from "./previewFormat";
import type { PreviewModel } from "./usePreviewModel";
export function PrototypeDialogs({ model }: { model: PreviewModel }) {
  const {
    address,
    setAddress,
    setCaptures,
    md,
    customHtml,
    modal,
    setModal,
    content,
    fileInput,
    active,
    current,
    pageCaptures,
    notify,
    addTab,
    copy,
    grab,
    downloadText,
  } = model;
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not([hidden]), textarea:not([hidden]), select:not([hidden]), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.tabIndex >= 0);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog?.addEventListener("keydown", trap);
    return () => {
      cancelAnimationFrame(frame);
      dialog?.removeEventListener("keydown", trap);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [modal]);
  return (
    <>
      {modal && (
        <div className="pv-modal-backdrop" onClick={() => setModal(null)}>
          <dialog
            open
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "new"
                ? "打开内容"
                : modal === "send"
                  ? "交给 Agent"
                  : modal === "share"
                    ? "分享与导出"
                    : "截图"
            }
            className="pv-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pv-panel-heading">
              <h2>
                {modal === "new"
                  ? "打开内容"
                  : modal === "send"
                    ? "交给 Agent"
                    : modal === "share"
                      ? "分享与导出"
                      : "截图"}
              </h2>
              <Button label="关闭弹窗" onClick={() => setModal(null)}>
                <X size={17} />
              </Button>
            </div>
            {modal === "new" && (
              <div className="pv-modal-body">
                <p className="pv-subtle">同一个入口，独立管理网页与文档。</p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    addTab("web", address || "about:blank", "网页演示");
                  }}
                >
                  <label className="pv-field">
                    网址
                    <input
                      autoFocus
                      aria-label="新标签网址"
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                    />
                  </label>
                  <button className="pv-primary" type="submit">
                    <Globe size={14} />
                    打开网页演示
                  </button>
                </form>
                <div className="pv-open-choices">
                  <button
                    onClick={() => {
                      fileInput.current?.click();
                      setModal(null);
                    }}
                  >
                    <FolderOpen />
                    本地文件<small>HTML / Markdown</small>
                  </button>
                  <button
                    onClick={() =>
                      addTab(
                        "markdown",
                        "workspace:///docs/README.md",
                        "README.md",
                      )
                    }
                  >
                    <FileText />
                    示例文档<small>目录、源码与批注</small>
                  </button>
                  <button
                    onClick={() => {
                      addTab(
                        "html",
                        "workspace:///examples/preview.html",
                        "preview.html",
                      );
                    }}
                  >
                    <FileCode2 />
                    示例 HTML<small>元素选取与移动视口</small>
                  </button>
                </div>
              </div>
            )}
            {modal === "send" && <PrototypeDelivery model={model} />}
            {modal === "share" && (
              <div className="pv-modal-body">
                <p>将页面或带批注的反馈带出工作区。</p>
                <button
                  className="pv-share-option"
                  onClick={() => void copy(active?.url ?? "")}
                >
                  <Link2 />
                  <span>
                    复制页面地址<small>本地地址无法供他人直接访问</small>
                  </span>
                </button>
                <button
                  className="pv-share-option"
                  disabled={!pageCaptures.length}
                  onClick={() =>
                    downloadText("page-feedback.md", captureText(pageCaptures))
                  }
                >
                  <Download />
                  <span>
                    导出批注<small>Markdown 格式，包含 DOM 与样式摘要</small>
                  </span>
                </button>
                <button
                  className="pv-share-option"
                  disabled={
                    active?.kind !== "markdown" && active?.kind !== "html"
                  }
                  onClick={() =>
                    downloadText(
                      active?.title ?? "document.md",
                      active?.kind === "markdown"
                        ? md
                        : (customHtml ?? htmlExampleDocument),
                      active?.kind === "markdown"
                        ? "text/markdown"
                        : "text/html",
                    )
                  }
                >
                  <FileText />
                  <span>
                    导出当前文档<small>本地保存，自行选择托管位置</small>
                  </span>
                </button>
                <div className="pv-note">
                  公开产物链接需要配置托管服务，原型不上传内容、不生成虚假公开链接。
                </div>
                <button
                  className="pv-secondary"
                  onClick={() =>
                    notify(
                      "正式版在配置托管服务并确认内容后创建链接；此处尚未上传",
                    )
                  }
                >
                  预览公开分享流程
                </button>
              </div>
            )}
            {modal === "screenshot" && (
              <div className="pv-modal-body">
                <p className="pv-subtle">
                  选择截图范围。原型用示意卡验证流程，未生成真实页面位图。
                </p>
                {["当前视口", "整页", "选中元素"].map((label) => (
                  <button
                    className="pv-share-option"
                    disabled={label === "选中元素" && !current}
                    key={label}
                    onClick={() => {
                      if (label === "选中元素" && current)
                        setCaptures((previous) =>
                          previous.map((item) =>
                            item.id === current.id
                              ? { ...item, screenshot: true }
                              : item,
                          ),
                        );
                      else {
                        const element =
                          content.current?.querySelector<HTMLElement>(
                            "[data-pick],h1",
                          );
                        if (element) grab(element, true);
                      }
                      setModal(null);
                      notify(
                        `${label}截图流程演示；真实位图由原生渲染宿主提供`,
                      );
                    }}
                  >
                    <Camera />
                    <span>
                      {label}
                      <small>
                        {label === "整页"
                          ? "包括滚动区域；失败时明确报错"
                          : label === "选中元素"
                            ? "根据元素矩形裁剪"
                            : "当前可见的页面范围"}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </dialog>
        </div>
      )}
    </>
  );
}
