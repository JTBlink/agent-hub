import type {
  BrowserAction,
  BrowserFrame,
  PickedElement,
  CookieImportSummary,
} from "../../api";
import { invoke } from "@tauri-apps/api/core";
export interface NativeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const nativeApi = {
  execute: <T = unknown>(id: string, action: BrowserAction) =>
    invoke<T>("preview_native_execute", { id, action }),
  frame: (id: string) =>
    invoke<{
      frame: BrowserFrame;
      picked?: PickedElement;
      cancelled?: boolean;
    }>("preview_native_frame", { id }),
  picking: (id: string, enabled: boolean) =>
    invoke<void>("preview_native_pick_mode", { id, enabled }),
  info: (id?: string) =>
    invoke<{
      engine: string;
      version?: string;
      userAgent?: string;
      inspection?: boolean;
      persistent?: boolean;
    }>("preview_native_info", { id }),
  userAgent: (id: string, value?: string) =>
    invoke<void>("preview_native_user_agent", { id, value: value || null }),
  cookiePrepare: (
    id: string,
    revision: string,
    source:
      | { kind: "text"; text: string }
      | { kind: "browser"; endpoint: string }
      | { kind: "file"; format: string },
  ) =>
    invoke<CookieImportSummary | null>("preview_native_cookie_prepare", {
      id,
      revision,
      source,
    }),
  cookieApply: (
    import_id: string,
    domains: string[],
    replace: boolean,
    sync_user_agent: boolean,
  ) =>
    invoke<{ imported: number; removed: number }>(
      "preview_native_cookie_apply",
      { importId: import_id, domains, replace, syncUserAgent: sync_user_agent },
    ),
  cookieCancel: (import_id: string) =>
    invoke<void>("preview_native_cookie_cancel", { importId: import_id }),
  open: (url: string, bounds: NativeBounds) =>
    invoke<string>("preview_native_open", { url, bounds }),
  update: (id: string, visible: boolean, bounds?: NativeBounds, url?: string) =>
    invoke<void>("preview_native_update", { id, visible, bounds, url }),
  action: (id: string, action: "back" | "forward" | "reload" | "close") =>
    invoke<void>("preview_native_action", { id, action }),
};
