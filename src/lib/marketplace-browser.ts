import { invoke } from "@tauri-apps/api/core";

export type MarketplaceBrowserAction = "back" | "forward" | "reload";

export function normalizeMarketplaceBrowserUrl(value: string) {
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

export function navigateMarketplaceBrowser(label: string, url: string) {
  return invoke<void>("navigate_marketplace_browser", { label, url });
}

export function controlMarketplaceBrowser(
  label: string,
  action: MarketplaceBrowserAction,
) {
  return invoke<void>("control_marketplace_browser", { label, action });
}

export function getMarketplaceBrowserUrl(label: string) {
  return invoke<string>("marketplace_browser_url", { label });
}
