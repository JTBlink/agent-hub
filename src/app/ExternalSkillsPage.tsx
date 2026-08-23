import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { type ReactNode, useState } from "react";

import type { SkillRootUsage } from "../lib/backend";
import {
  MarketplaceBrowser,
  type BrowserNavigationRequest,
} from "./MarketplaceBrowser";

type ExternalSkillIcon = "external" | "file" | "folder" | "spark";

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
  const [activeSource, setActiveSource] = useState(webSources[0].url);

  function browse(url: string) {
    setActiveSource(url);
    setNavigation((current) => ({ id: current.id + 1, url }));
  }

  function revealDirectory(path: string) {
    void revealItemInDir(path).catch(() => {
      window.alert("无法在文件管理器中显示该目录，请确认目录仍然存在。");
    });
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
            className={activeSource === source.url ? "active" : ""}
            key={source.name}
            type="button"
            aria-current={activeSource === source.url ? "page" : undefined}
            onClick={() => browse(source.url)}
          >
            <span className="marketplace-launchpad-icon">
              {renderIcon(source.icon, 18)}
            </span>
            <span>
              <strong>{source.name}</strong>
              <small>{source.description}</small>
            </span>
            <code>{source.host}</code>
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

      <MarketplaceBrowser request={navigation} />
    </div>
  );
}
