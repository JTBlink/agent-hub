import { Check } from "lucide-react";
import { PrototypeLibrary } from "./PrototypeLibrary";
import { PrototypeToolbar } from "./PrototypeToolbar";
import { PrototypePage } from "./PrototypePage";
import { PrototypeInspector } from "./PrototypeInspector";
import { PrototypeDialogs } from "./PrototypeDialogs";
import { usePreviewModel } from "./usePreviewModel";
export function PreviewPrototype() {
  const model = usePreviewModel();
  const {
    modal,
    panelOpen,
    picking,
    hover,
    toast,
    libraryOpen,
    fileInput,
    cookieInput,
    notify,
    importFile,
  } = model;
  return (
    <div className="pv-app">
      <div className="pv-shell" inert={modal !== null}>
        {libraryOpen && (
          <div className="pv-navigation">
            <PrototypeLibrary model={model} />
          </div>
        )}
        <main className="pv-main">
          <PrototypeToolbar model={model} />
          <div className="pv-workarea">
            <PrototypePage model={model} />
            {panelOpen && (
              <aside className="pv-inspector">
                <PrototypeInspector model={model} />
              </aside>
            )}
          </div>
        </main>
      </div>
      {hover && picking && (
        <div
          className="pv-selection"
          style={{
            left: hover.x,
            top: hover.y,
            width: hover.w,
            height: hover.h,
          }}
        >
          <span>{hover.label}</span>
        </div>
      )}
      {toast && (
        <div role="status" className="pv-toast">
          <Check size={15} />
          {toast}
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".md,.markdown,.html,.htm"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = "";
        }}
      />
      <input
        ref={cookieInput}
        type="file"
        accept="application/json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 1024 * 1024) {
            notify("Cookie 文件超过 1 MiB");
            return;
          }
          try {
            const value: unknown = JSON.parse(await file.text());
            notify(
              Array.isArray(value)
                ? `已读取 ${value.length} 条 Cookie 结构；未导入真实会话`
                : "需要 Cookie 数组格式",
            );
          } catch {
            notify("无法解析 JSON 文件");
          }
        }}
      />
      <PrototypeDialogs model={model} />
    </div>
  );
}
