/** Synthetic regression fixture; never installs a skill or calls native IPC. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { GitBrowserDialog } from "../../src/components/GitBrowserDialog";
import { i18nReady } from "../../src/i18n";
import { applyTextSize } from "../../src/lib/textScale";
import "../../src/index.css";

const params = new URLSearchParams(location.search);
await i18nReady;
applyTextSize(params.get("size") ?? "default");
document.documentElement.classList.toggle(
  "dark",
  params.get("theme") !== "light",
);
export function Fixture() {
  const [open, setOpen] = useState(true);
  return (
    <main
      style={{
        position: "fixed",
        left: "13%",
        top: "11%",
        width: "55%",
        height: "65%",
        overflow: "hidden",
        transform: "translate(24px, 16px)",
      }}
    >
      <button className="app-button-secondary" onClick={() => setOpen(true)}>
        打开弹窗
      </button>
      {open && (
        <GitBrowserDialog title="覆盖安装" onClose={() => setOpen(false)}>
          <p className="mb-4 text-sm text-muted">
            将用当前仓库内容替换已有技能，并更新来源；现有内容及本地修改会被覆盖。
          </p>
          <form onSubmit={(event) => event.preventDefault()}>
            <div className="space-y-3">
              {Array.from(
                { length: params.has("long") ? 24 : 1 },
                (_, index) => (
                  <label key={index} className="block text-xs text-muted">
                    plugins/example/skills/demo-{index + 1}
                    <input
                      data-initial-focus={index === 0 || undefined}
                      aria-label={`技能名称 ${index + 1}`}
                      className="app-input mt-1 w-full"
                      value={`demo-${index + 1}`}
                      readOnly
                    />
                  </label>
                ),
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="app-button-secondary"
                onClick={() => setOpen(false)}
              >
                取消
              </button>
              <button type="submit" className="app-button-primary">
                确认覆盖安装
              </button>
            </div>
          </form>
        </GitBrowserDialog>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
