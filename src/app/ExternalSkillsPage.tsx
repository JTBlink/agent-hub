import type { ReactNode } from "react";

import { openExternalSkillSource } from "../lib/external-skill-links";

type ExternalSkillIcon = "arrow" | "external" | "file" | "spark";

const webSources: Array<{
  name: string;
  description: string;
  url: string;
  icon: ExternalSkillIcon;
}> = [
  {
    name: "skills.sh",
    description: "社区 Skill 目录",
    url: "https://skills.sh/",
    icon: "spark",
  },
  {
    name: "GitHub",
    description: "公开仓库与版本",
    url: "https://github.com/topics/agent-skills",
    icon: "external",
  },
  {
    name: "Claude Marketplace",
    description: "Marketplace 规范与示例",
    url: "https://github.com/anthropics/skills",
    icon: "file",
  },
];

export function ExternalSkillsPage({
  viewTabs,
  sourcePanel,
  renderIcon,
}: {
  viewTabs: ReactNode;
  sourcePanel: ReactNode;
  renderIcon: (name: ExternalSkillIcon, size: number) => ReactNode;
}) {
  function openSource(url: string) {
    void openExternalSkillSource(url).catch(() => {
      window.alert("无法打开系统浏览器，请检查系统默认浏览器设置。");
    });
  }

  return (
    <div className="page marketplace-page">
      <h1 className="sr-only">Skills Marketplace</h1>
      {viewTabs}
      <section className="marketplace-intro" aria-labelledby="marketplace-title">
        <div>
          <p className="eyebrow">外部 Skill</p>
          <h2 id="marketplace-title">找到能力，再决定安装到哪里</h2>
          <p>
            输入仓库来源，查看其中尚未安装的 Skill。AgentHub
            只读检查文件，并在写入前展示目标路径和完整清单。
          </p>
        </div>
        <div className="marketplace-route" aria-label="外部 Skill 安装流程">
          <span>外部来源</span>
          {renderIcon("arrow", 14)}
          <span>安全预览</span>
          {renderIcon("arrow", 14)}
          <strong>目标 Agent</strong>
        </div>
      </section>
      <section
        className="marketplace-web-sources"
        aria-labelledby="marketplace-web-title"
      >
        <div className="marketplace-web-heading">
          <div>
            <p className="eyebrow">浏览器查找</p>
            <h2 id="marketplace-web-title">先在网页里挑选，再回到这里安装</h2>
          </div>
          <span>不会自动拉取外部仓库</span>
        </div>
        <div className="marketplace-web-grid">
          {webSources.map((source) => (
            <button
              className="marketplace-web-card"
              key={source.name}
              type="button"
              onClick={() => openSource(source.url)}
            >
              <span className="marketplace-web-icon">
                {renderIcon(source.icon, 17)}
              </span>
              <span>
                <strong>{source.name}</strong>
                <small>{source.description}</small>
              </span>
              {renderIcon("external", 14)}
            </button>
          ))}
        </div>
      </section>
      {sourcePanel}
    </div>
  );
}
