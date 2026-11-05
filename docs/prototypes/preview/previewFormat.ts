import type { Capture } from "./fixtures";
export type Panel =
  | "feedback"
  | "history"
  | "downloads"
  | "profiles"
  | "automation"
  | "remote"
  | "capabilities";
export function captureText(items: Capture[]) {
  return items
    .map(
      (item) =>
        `## ${item.selector}\nURL: ${item.url}\n尺寸: ${item.width} × ${item.height}\n来源: ${item.source ?? "未识别"}\n\n${item.text}\n\nHTML:\n${item.html}\n\nCSS:\n${item.styles}\n\n修改意见: ${item.note || "未填写"}`,
    )
    .join("\n\n---\n\n");
}
