import { invoke } from "@tauri-apps/api/core";
export interface BrowserProfile {
  id: string;
  name: string;
  executable?: string | null;
  endpoint?: string | null;
  proxy?: string | null;
  ephemeral?: boolean;
  deleting?: boolean;
}
export interface BrowserInfo {
  executable: string | null;
  profiles: BrowserProfile[];
}
export interface PreviewDocument {
  fragment?: string;
  id: string;
  title: string;
  kind: "markdown" | "html";
  content: string;
  revision: string;
  url?: string;
}
export interface BrowserPageInfo {
  owner?: string | null;
  id: string;
  profile: string;
  url: string;
  title: string;
  revision: string;
}
export interface BrowserFrame {
  version: number;
  image: string;
  info: {
    url: string;
    title: string;
    revision: string;
    ready: string;
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
    dpr: number;
    chooser?: { token: string; mode: string } | null;
    dialog?: { type: string; message: string; defaultPrompt: string } | null;
    history?: {
      currentIndex: number;
      entries: { id: number; url: string; title: string }[];
    };
  };
  events: { method: string; params: Record<string, unknown> }[];
}
export interface PickedElement {
  role?: string | null;
  label?: string | null;
  screenshot?: string;
  selector: string;
  text: string;
  html: string;
  styles: Record<string, string>;
  bounds: { x: number; y: number; width: number; height: number };
  documentBounds: { x: number; y: number; width: number; height: number };
  revision: string;
  url: string;
}
export type BrowserAction =
  | { kind: "verify_revision"; expected_revision: string }
  | { kind: "handle_dialog"; accept: boolean; prompt?: string }
  | { kind: "cancel_upload"; token: string }
  | { kind: "navigate"; url: string }
  | { kind: "reload"; hard: boolean }
  | { kind: "stop" | "back" | "forward" | "snapshot" | "cookies" | "storage" }
  | { kind: "resize"; width: number; height: number; mobile: boolean }
  | {
      kind: "mouse";
      x: number;
      y: number;
      event: "mousePressed" | "mouseReleased" | "mouseMoved" | "mouseWheel";
      button?: string;
      delta_x?: number;
      delta_y?: number;
    }
  | { kind: "text"; text: string }
  | { kind: "key"; key: string; code: string; modifiers: number }
  | { kind: "evaluate"; expression: string }
  | { kind: "pick"; x: number; y: number }
  | {
      kind: "screenshot";
      full: boolean;
      expected_revision?: string;
      clip?: { x: number; y: number; width: number; height: number };
    }
  | { kind: "find"; text: string; backwards: boolean }
  | { kind: "import_cookies"; cookies: unknown[] };
const request = <T>(value: object) =>
  invoke<T>("preview_request", { request: value });
export const previewApi = {
  list: () => request<BrowserPageInfo[]>({ kind: "list" }),
  captureRendered: (
    html: string,
    width: number,
    height: number,
    profile: string,
    full: boolean,
    clip?: { x: number; y: number; width: number; height: number },
  ) =>
    request<string>({
      kind: "capture_rendered",
      html,
      width,
      height,
      profile,
      full,
      clip,
    }),
  prepareDelivery: (text: string, images: string[]) =>
    request<{
      prompt: string;
      context: string;
      context_path: string;
      attachments: string[];
    }>({ kind: "prepare_delivery", text, images }),
  prepareCookies: (id: string, revision: string, text: string) =>
    request<CookieImportSummary>({
      kind: "cookie_prepare",
      id,
      revision,
      text,
    }),
  browserCookies: (id: string, revision: string, endpoint: string) =>
    request<CookieImportSummary>({
      kind: "cookie_browser",
      id,
      revision,
      endpoint,
    }),
  cookieFile: (
    id: string,
    revision: string,
    format: "json" | "netscape" | "firefox",
  ) =>
    invoke<CookieImportSummary | null>("preview_cookie_file", {
      id,
      revision,
      format,
    }),
  applyCookies: (import_id: string, domains: string[], replace: boolean) =>
    request<{ imported: number; removed: number }>({
      kind: "cookie_apply",
      import_id,
      domains,
      replace,
    }),
  cancelCookieImport: (import_id: string) =>
    request<void>({ kind: "cookie_cancel", import_id }),
  info: () => request<BrowserInfo>({ kind: "info" }),
  create: (profile: string, url: string, owner?: string) =>
    request<string>({ kind: "create", profile, url, owner }),
  frame: (id: string, since?: number) =>
    request<BrowserFrame>({ kind: "frame", id, since }),
  action: <T = unknown>(id: string, action: BrowserAction) =>
    request<T>({ kind: "action", id, action }),
  close: (id: string) => request<void>({ kind: "close", id }),
  deleteProfile: (id: string) => request<void>({ kind: "delete_profile", id }),
  profile: (profile: BrowserProfile) =>
    request<void>({ kind: "save_profile", profile }),
  upload: (id: string, revision: string, token: string, multiple: boolean) =>
    invoke<boolean>("preview_upload", { id, revision, token, multiple }),
  downloads: () => request<PreviewDownload[]>({ kind: "downloads" }),
  cancelDownload: (profile: string, id: string) =>
    request<void>({ kind: "cancel_download", profile, id }),
  openDownload: (profile: string, id: string, reveal = false) =>
    invoke<void>("preview_download_file", { profile, id, reveal }),
  pickDocument: () => invoke<PreviewDocument | null>("preview_pick_document"),
  openLink: (id: string, href: string) =>
    request<
      | { kind: "document"; document: PreviewDocument }
      | { kind: "page"; url: string }
    >({ kind: "open_link", id, href }),
  openProject: (
    projectId: string,
    worktreePath: string,
    relativePath: string,
  ) =>
    invoke<PreviewDocument>("preview_open_project", {
      projectId,
      worktreePath,
      relativePath,
    }),
  readDocument: (id: string) =>
    request<PreviewDocument>({ kind: "read_document", id }),
  saveDocument: (id: string, content: string, revision: string) =>
    request<PreviewDocument>({ kind: "save_document", id, content, revision }),
  closeDocument: (id: string) => request<void>({ kind: "close_document", id }),
  export: (name: string, content: string, binary = false) =>
    invoke<boolean>("preview_export", { name, content, binary }),
};

export interface PreviewDownload {
  id: string;
  profile: string;
  name: string;
  state: string;
  received: number;
  total: number;
  local: boolean;
}

export interface CookieImportSummary {
  id: string;
  target: {
    id: string;
    profile: string;
    profile_name: string;
    revision: string;
    title: string;
    url: string;
  };
  domains: Record<string, number>;
  total: number;
  importable: number;
  skipped: {
    invalid: number;
    expired: number;
    partitioned: number;
    bound: number;
  };
}
