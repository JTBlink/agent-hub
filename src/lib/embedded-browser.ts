import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export type EmbeddedBrowserAction = "back" | "forward" | "reload";

export function normalizeEmbeddedBrowserUrl(value: string) {
  const input = value.trim();
  if (!input) throw new Error("请输入要打开的网址。");

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input)
    ? input
    : `https://${input}`;
  const url = new URL(candidate);
  if (!url.hostname || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("浏览器仅支持 http 或 https 网页。");
  }
  return url.toString();
}

export function navigateEmbeddedBrowser(label: string, url: string) {
  return invoke<void>("navigate_embedded_browser", { label, url });
}

export function controlEmbeddedBrowser(
  label: string,
  action: EmbeddedBrowserAction,
) {
  return invoke<void>("control_embedded_browser", { label, action });
}

export function getEmbeddedBrowserUrl(label: string) {
  return invoke<string>("embedded_browser_url", { label });
}

export function openExternalUrl(url: string) {
  return openUrl(url);
}
