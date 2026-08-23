import { isTauri } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { openExternalSkillSource } from "../lib/external-skill-links";
import {
  controlMarketplaceBrowser,
  getMarketplaceBrowserUrl,
  navigateMarketplaceBrowser,
  normalizeMarketplaceBrowserUrl,
  type MarketplaceBrowserAction,
} from "../lib/marketplace-browser";

let browserInstance = 0;

function BrowserControlIcon({
  name,
}: {
  name: MarketplaceBrowserAction | "external";
}) {
  if (name === "reload") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 5v6h-6" />
      </svg>
    );
  }
  if (name === "external") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 4h6v6M20 4 11 13M18 13v6H4V5h6" />
      </svg>
    );
  }
  return (
    <svg
      className={name === "back" ? "browser-icon-back" : undefined}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export interface BrowserNavigationRequest {
  id: number;
  url: string;
}

export function MarketplaceBrowser({
  request,
}: {
  request: BrowserNavigationRequest;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<Webview | undefined>(undefined);
  const editingAddressRef = useRef(false);
  const initialUrlRef = useRef(request.url);
  const lastRequestRef = useRef(request.id);
  const [label, setLabel] = useState<string>();
  const [state, setState] = useState<
    "creating" | "ready" | "unavailable" | "error"
  >("creating");
  const [currentUrl, setCurrentUrl] = useState(request.url);
  const [address, setAddress] = useState(request.url);
  const [message, setMessage] = useState("正在启动内嵌浏览器…");

  useEffect(() => {
    if (!isTauri()) {
      setState("unavailable");
      setMessage("内嵌浏览器会在 AgentHub 桌面应用中显示。");
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport) return;
    const webviewLabel = `marketplace-browser-${Date.now()}-${++browserInstance}`;
    let disposed = false;
    let animationFrame = 0;
    let webviewCreated = false;
    let webviewVisible = true;

    const syncBounds = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const webview = webviewRef.current;
        if (!webview || !webviewCreated || disposed) return;
        const bounds = viewport.getBoundingClientRect();
        const left = Math.max(0, Math.round(bounds.left + 1));
        const top = Math.max(0, Math.round(bounds.top + 1));
        const right = Math.min(window.innerWidth, Math.round(bounds.right - 1));
        const bottom = Math.min(
          window.innerHeight,
          Math.round(bounds.bottom - 1),
        );
        const width = right - left;
        const height = bottom - top;
        const visible = width >= 120 && height >= 120;

        if (!visible) {
          if (webviewVisible) {
            webviewVisible = false;
            void webview.hide();
          }
          return;
        }
        void Promise.all([
          webview.setPosition(new LogicalPosition(left, top)),
          webview.setSize(new LogicalSize(width, height)),
          webviewVisible ? Promise.resolve() : webview.show(),
        ]);
        webviewVisible = true;
      });
    };

    const bounds = viewport.getBoundingClientRect();
    const webview = new Webview(getCurrentWindow(), webviewLabel, {
      url: initialUrlRef.current,
      x: Math.round(bounds.left + 1),
      y: Math.round(bounds.top + 1),
      width: Math.max(1, Math.round(bounds.width - 2)),
      height: Math.max(1, Math.round(bounds.height - 2)),
      focus: false,
      devtools: false,
      zoomHotkeysEnabled: true,
    });
    webviewRef.current = webview;

    void webview.once("tauri://created", () => {
      if (disposed) return;
      webviewCreated = true;
      setLabel(webviewLabel);
      setState("ready");
      setMessage("");
      syncBounds();
    });
    void webview.once("tauri://error", () => {
      if (disposed) return;
      setState("error");
      setMessage("内嵌浏览器启动失败，可改用系统浏览器打开。");
    });

    const resizeObserver = new ResizeObserver(syncBounds);
    resizeObserver.observe(viewport);
    window.addEventListener("resize", syncBounds);
    document.addEventListener("scroll", syncBounds, true);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncBounds);
      document.removeEventListener("scroll", syncBounds, true);
      webviewRef.current = undefined;
      setLabel(undefined);
      void webview.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!label || state !== "ready" || request.id === lastRequestRef.current) {
      return;
    }
    lastRequestRef.current = request.id;
    setCurrentUrl(request.url);
    setAddress(request.url);
    void navigateMarketplaceBrowser(label, request.url).catch(() => {
      setMessage("网页打开失败，请检查地址或网络连接。");
    });
  }, [label, request, state]);

  useEffect(() => {
    if (!label || state !== "ready") return;
    const poll = window.setInterval(() => {
      void getMarketplaceBrowserUrl(label)
        .then((url) => {
          setCurrentUrl(url);
          if (!editingAddressRef.current) setAddress(url);
        })
        .catch(() => undefined);
    }, 900);
    return () => window.clearInterval(poll);
  }, [label, state]);

  async function submitAddress(event: FormEvent) {
    event.preventDefault();
    try {
      if (!label) throw new Error("内嵌浏览器仍在启动，请稍后重试。");
      const url = normalizeMarketplaceBrowserUrl(address);
      setMessage("");
      setCurrentUrl(url);
      setAddress(url);
      await navigateMarketplaceBrowser(label, url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "网页打开失败。");
    }
  }

  function control(action: MarketplaceBrowserAction) {
    if (!label) return;
    setMessage("");
    void controlMarketplaceBrowser(label, action).catch(() => {
      setMessage("浏览器操作失败，请稍后重试。");
    });
  }

  function openExternal() {
    void openExternalSkillSource(currentUrl).catch(() => {
      setMessage("无法打开系统浏览器，请检查默认浏览器设置。");
    });
  }

  return (
    <section className="marketplace-browser-shell" aria-label="内嵌网页浏览器">
      <div className="marketplace-browser-toolbar">
        <div className="marketplace-browser-history" aria-label="浏览器导航">
          <button
            type="button"
            onClick={() => control("back")}
            aria-label="后退"
          >
            <BrowserControlIcon name="back" />
          </button>
          <button
            type="button"
            onClick={() => control("forward")}
            aria-label="前进"
          >
            <BrowserControlIcon name="forward" />
          </button>
          <button
            type="button"
            onClick={() => control("reload")}
            aria-label="刷新网页"
          >
            <BrowserControlIcon name="reload" />
          </button>
        </div>
        <form className="marketplace-address-bar" onSubmit={submitAddress}>
          <span aria-hidden="true" />
          <label className="sr-only" htmlFor="marketplace-browser-address">
            网页地址
          </label>
          <input
            id="marketplace-browser-address"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={address}
            onFocus={() => {
              editingAddressRef.current = true;
            }}
            onBlur={() => {
              editingAddressRef.current = false;
            }}
            onChange={(event) => setAddress(event.target.value)}
          />
        </form>
        <button
          className="marketplace-browser-external"
          type="button"
          onClick={openExternal}
          aria-label="在系统浏览器中打开"
          title="在系统浏览器中打开"
        >
          <BrowserControlIcon name="external" />
        </button>
      </div>
      {message && (
        <p className={`marketplace-browser-message ${state}`} role="status">
          {message}
          {state === "unavailable" || state === "error" ? (
            <button type="button" onClick={openExternal}>
              在系统浏览器打开
            </button>
          ) : null}
        </p>
      )}
      <div
        className={`marketplace-browser-viewport ${state}`}
        ref={viewportRef}
        aria-label="网页内容区域"
      >
        {state !== "ready" && <span>WEB VIEW</span>}
      </div>
    </section>
  );
}
