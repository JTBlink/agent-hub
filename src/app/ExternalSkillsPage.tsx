import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { type ReactNode, useRef, useState } from "react";

import type { SkillRootUsage } from "../lib/backend";
import {
  MarketplaceBrowser,
  type BrowserNavigationRequest,
} from "./MarketplaceBrowser";

type ExternalSkillIcon =
  | "arrow"
  | "close"
  | "external"
  | "file"
  | "folder"
  | "spark";

const webSources: Array<{
  name: string;
  description: string;
  url: string;
  host: string;
  icon: ExternalSkillIcon;
}> = [
  {
    name: "skills.sh",
    description: "社区 Skill 目录",
    url: "https://skills.sh/",
    host: "skills.sh",
    icon: "spark",
  },
  {
    name: "GitHub Skills",
    description: "公开仓库与项目",
    url: "https://github.com/topics/agent-skills",
    host: "github.com",
    icon: "external",
  },
  {
    name: "Claude Marketplace",
    description: "官方 Skills 与插件",
    url: "https://github.com/anthropics/skills",
    host: "github.com/anthropics",
    icon: "file",
  },
];

function directoryName(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/\/$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || path;
}

export function ExternalSkillsPage({
  viewTabs,
  localRoots,
  renderIcon,
}: {
  viewTabs: ReactNode;
  localRoots: SkillRootUsage[];
  renderIcon: (name: ExternalSkillIcon, size: number) => ReactNode;
}) {
  const [navigation, setNavigation] = useState<BrowserNavigationRequest>({
    id: 0,
    url: webSources[0].url,
  });
  const [activeSource, setActiveSource] =
    useState<(typeof webSources)[number]>();
  const sourceTriggerRef = useRef<HTMLButtonElement>(null);

  function browse(
    source: (typeof webSources)[number],
    trigger: HTMLButtonElement,
  ) {
    sourceTriggerRef.current = trigger;
    setActiveSource(source);
    setNavigation((current) => ({ id: current.id + 1, url: source.url }));
  }

  function closeBrowser() {
    setActiveSource(undefined);
    window.requestAnimationFrame(() => sourceTriggerRef.current?.focus());
  }

  useEffect(() => {
    if (!activeSource) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeBrowser();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeSource]);

  function revealDirectory(path: string) {
    void revealItemInDir(path).catch(() => {
      window.alert("无法在文件管理器中显示该目录，请确认目录仍然存在。");
    });
  }

  if (activeSource) {
    return (
      <div className="page marketplace-browser-page">
        <header className="marketplace-browser-page-header">
          <button
            className="button button-ghost marketplace-browser-back"
            type="button"
            onClick={closeBrowser}
            title="退出内嵌浏览器（Esc）"
          >
            {renderIcon("arrow", 15)}
            退出浏览器
          </button>
          <div className="marketplace-browser-page-title">
            <h1>{activeSource.name}</h1>
            <p>在 AgentHub 内浏览 Skill 来源</p>
          </div>
          <div className="marketplace-browser-page-actions">
            <span className="marketplace-browser-badge">
              <i /> 内嵌浏览器
            </span>
            <button
              className="button button-ghost marketplace-browser-close"
              type="button"
              onClick={closeBrowser}
              aria-label="关闭内嵌浏览器"
              title="关闭内嵌浏览器"
            >
              {renderIcon("close", 16)}
              <span>关闭</span>
            </button>
          </div>
        </header>
        <MarketplaceBrowser request={navigation} />
      </div>
    );
  }

  return (
    <div className="page marketplace-page">
      <h1 className="sr-only">Skills Marketplace</h1>
      {viewTabs}
      <header className="marketplace-heading">
        <div>
          <p className="eyebrow">Skill 导航</p>
          <h2>浏览你常用的 Skill 站点</h2>
          <p>从快捷入口出发，直接在 AgentHub 里查看网页。</p>
        </div>
        <span className="marketplace-browser-badge">
          <i /> 内嵌浏览器
        </span>
      </header>

      <nav className="marketplace-launchpad" aria-label="Skill 网站快捷入口">
        {webSources.map((source) => (
          <button
            key={source.name}
            type="button"
            onClick={(event) => browse(source, event.currentTarget)}
          >
            <span className="marketplace-launchpad-icon">
              {renderIcon(source.icon, 18)}
            </span>
            <span>
              <strong>{source.name}</strong>
              <small>{source.description}</small>
            </span>
            <code>{source.host}</code>
            <span className="marketplace-launchpad-action" aria-hidden="true">
              {renderIcon("arrow", 14)}
            </span>
          </button>
        ))}
      </nav>

      {localRoots.length > 0 && (
        <section
          className="marketplace-local"
          aria-labelledby="local-skill-folders-title"
        >
          <div className="marketplace-local-heading">
            <span className="marketplace-local-icon">
              {renderIcon("folder", 16)}
            </span>
            <div>
              <h2 id="local-skill-folders-title">本地目录</h2>
              <p>直接在文件管理器中定位</p>
            </div>
          </div>
          <div className="marketplace-local-list">
            {localRoots.map((root) => (
              <button
                type="button"
                key={root.path}
                title={root.path}
                onClick={() => revealDirectory(root.path)}
              >
                <span>
                  <strong>{directoryName(root.path)}</strong>
                  <small>{root.skillCount} 个 Skill</small>
                </span>
                {renderIcon("external", 13)}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
