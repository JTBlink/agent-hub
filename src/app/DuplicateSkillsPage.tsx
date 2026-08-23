import type { ReactNode } from "react";

import type { InstalledSkill } from "../lib/backend";

export type DuplicateSkillGroup = {
  name: string;
  agent: string;
  agentName: string;
  agentMark: string;
  agentTone: string;
  scope: "global" | "workspace";
  matches: InstalledSkill[];
};

type DuplicateSkillsPageProps = {
  groups: DuplicateSkillGroup[];
  feedback?: ReactNode;
  backIcon: ReactNode;
  warningIcon: ReactNode;
  resolvedIcon: ReactNode;
  busyPath?: string;
  busyAction?: "migrate" | "archive";
  onBack: () => void;
  onArchive: (path: string) => void;
  renderLocation: (skill: InstalledSkill) => ReactNode;
};

export function DuplicateSkillsPage({
  groups,
  feedback,
  backIcon,
  warningIcon,
  resolvedIcon,
  busyPath,
  busyAction,
  onBack,
  onArchive,
  renderLocation,
}: DuplicateSkillsPageProps) {
  const replicaCount = groups.reduce(
    (total, group) => total + group.matches.length,
    0,
  );

  return (
    <div className="page duplicate-skills-page">
      <button className="duplicate-page-back" type="button" onClick={onBack}>
        <span className="duplicate-page-back-icon">{backIcon}</span>
        返回 Skills
      </button>

      <header className="duplicate-page-heading">
        <div>
          <p className="eyebrow">Skills / 重复项</p>
          <h1 id="duplicate-page-title" tabIndex={-1}>
            检查重复 Skill
          </h1>
          <p>
            同一个
            Agent、同一个作用域下存在多个真实副本。逐组确认来源和安装位置，再决定是否归档旧副本。
          </p>
        </div>
        {groups.length > 0 && (
          <div className="duplicate-page-summary" aria-label="重复项统计">
            <strong>{groups.length}</strong>
            <span>组冲突</span>
            <i aria-hidden="true" />
            <strong>{replicaCount}</strong>
            <span>个副本</span>
          </div>
        )}
      </header>

      {feedback}

      {groups.length > 0 ? (
        <>
          <div className="duplicate-page-note">
            {warningIcon}
            <p>
              不同 Agent 共用 <code>~/.agents/skills</code> 是 skills.sh
              的正常布局，不属于重复安装，也不会出现在下方列表中。
            </p>
          </div>
          <div className="duplicate-page-groups">
            {groups.map((group, groupIndex) => {
              const legacyCopies = group.matches.filter((skill) =>
                skill.path.includes("/.codex/skills/"),
              );
              const isCodexLegacy =
                group.agent === "codex" &&
                group.scope === "global" &&
                legacyCopies.length > 0;
              return (
                <article
                  className="duplicate-page-group"
                  key={group.agent + "-" + group.scope + "-" + group.name}
                >
                  <div className="duplicate-group-index" aria-hidden="true">
                    {String(groupIndex + 1).padStart(2, "0")}
                  </div>
                  <div className="duplicate-group-content">
                    <header className="duplicate-group-heading">
                      <div
                        className={"agent-avatar small " + group.agentTone}
                        aria-hidden="true"
                      >
                        {group.agentMark}
                      </div>
                      <div>
                        <h2>{group.name}</h2>
                        <p>
                          {group.agentName} ·{" "}
                          {group.scope === "global" ? "全局" : "工作空间"} ·{" "}
                          {group.matches.length} 个真实副本
                        </p>
                      </div>
                    </header>

                    {isCodexLegacy && (
                      <div className="duplicate-group-recommendation">
                        <div>
                          <strong>建议保留标准目录</strong>
                          <p>
                            Codex 推荐保留 <code>~/.agents/skills</code>；
                            <code>~/.codex/skills</code>{" "}
                            是兼容目录。归档只会把旧副本移入 AgentHub
                            备份目录，不会永久删除。
                          </p>
                        </div>
                        <div className="duplicate-skill-actions">
                          {legacyCopies.map((skill) => (
                            <button
                              className="button button-secondary"
                              type="button"
                              key={skill.path}
                              disabled={Boolean(busyPath)}
                              onClick={() => onArchive(skill.path)}
                            >
                              {busyPath === skill.path &&
                              busyAction === "archive"
                                ? "归档中…"
                                : "归档旧副本"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="duplicate-group-locations">
                      <strong>安装位置</strong>
                      {group.matches.map((skill) => (
                        <div
                          className="duplicate-location-row"
                          key={
                            group.agent + "-" + group.scope + "-" + skill.path
                          }
                        >
                          {renderLocation(skill)}
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <section className="duplicate-page-resolved" role="status">
          <div>{resolvedIcon}</div>
          <h2>重复项已处理</h2>
          <p>当前没有需要检查的同 Agent、同作用域重复 Skill。</p>
          <button
            className="button button-primary"
            type="button"
            onClick={onBack}
          >
            返回 Skills
          </button>
        </section>
      )}
    </div>
  );
}
