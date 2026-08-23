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
      description: "用户目录下的 Skill，对所有工作空间生效",
      meta: "全局",
    },
    ...workspaces.map((workspace) => ({
      value: workspace.normalizedPath,
      label: workspace.displayName,
      description: "当前工作空间的 Skill，仅对这个工作空间生效",
      meta: "工作空间",
    })),
  ];

  return (
    <div className="skill-workspace-switcher">
      <div className="skill-workspace-switcher-heading">
        <div>
          <span className="skill-workspace-switcher-kicker">工作空间上下文</span>
          <span className="skill-workspace-switcher-caption">
            {value ? "正在查看当前工作空间 Skill" : "未选择工作空间，仅显示全局 Skill"}
          </span>
        </div>
        <button className="text-button" type="button" onClick={onManage}>
          管理工作空间
        </button>
      </div>
      <DropdownMenu
        className="workspace-dropdown"
        options={options}
        value={value}
        onChange={onChange}
        ariaLabel="选择当前工作空间"
        triggerCaption="当前工作空间"
        menuHeading="切换当前工作空间"
        menuCount={`${workspaces.length} 个已登记`}
        placeholder="仅全局 Skills"
      />
    </div>
  );
}
