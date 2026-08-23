import type { WorkspaceRecord } from "../lib/backend";
import { DropdownMenu } from "./DropdownMenu";

export function SkillWorkspaceSwitcher({
  workspaces,
  value,
  onChange,
  onManage,
}: {
  workspaces: WorkspaceRecord[];
  value: string;
  onChange: (value: string) => void;
  onManage: () => void;
}) {
  const options = [
    {
      value: "",
      label: "仅全局 Skills",
      description: "用户目录下的 Skill，对所有项目生效",
      meta: "全局",
    },
    ...workspaces.map((workspace) => ({
      value: workspace.normalizedPath,
      label: workspace.displayName,
      description: "当前项目的 Skill，仅对这个项目生效",
      meta: "项目",
    })),
  ];

  return (
    <div className="skill-workspace-switcher">
      <div className="skill-workspace-switcher-heading">
        <div>
          <span className="skill-workspace-switcher-kicker">项目上下文</span>
          <span className="skill-workspace-switcher-caption">
            {value ? "正在查看当前项目 Skill" : "未选择项目，仅显示全局 Skill"}
          </span>
        </div>
        <button className="text-button" type="button" onClick={onManage}>
          管理项目
        </button>
      </div>
      <DropdownMenu
        className="workspace-dropdown"
        options={options}
        value={value}
        onChange={onChange}
        ariaLabel="选择当前项目"
        triggerCaption="当前项目"
        menuHeading="切换当前项目"
        menuCount={`${workspaces.length} 个已登记`}
        placeholder="仅全局 Skills"
      />
    </div>
  );
}
