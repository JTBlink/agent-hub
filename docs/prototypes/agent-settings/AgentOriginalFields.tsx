// Match the existing settings' save/cancel/reset and confirmed removal behavior.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { initialAgents, type PrototypeAgent } from "./agentData";
import { AgentPathField } from "./AgentPathField";
import { AgentPrototypeDialog } from "./AgentPrototypeDialog";
export function AgentOriginalFields({
  agent,
  update,
  remove,
}: {
  agent: PrototypeAgent;
  update: (patch: Partial<PrototypeAgent>) => void;
  remove: () => void;
}) {
  const baseline = initialAgents.find((item) => item.key === agent.key);
  const [confirming, setConfirming] = useState(false);
  return (
    <details className="ap-original-fields">
      <summary role="button" aria-label={`${agent.display_name} 详细设置`}>
        详细设置{agent.is_custom && <span>自定义</span>}
        {(agent.has_path_override || agent.has_project_path_override) && (
          <span>路径已修改</span>
        )}
        {agent.is_custom && agent.project_relative_skills_dir && (
          <span>支持项目技能</span>
        )}
      </summary>
      <div className="ap-original-body">
        <AgentPathField
          name={agent.display_name}
          label="技能目录"
          value={agent.skills_dir}
          save={(value) =>
            update({ skills_dir: value, has_path_override: true })
          }
          reset={
            !agent.is_custom && baseline && agent.has_path_override
              ? () =>
                  update({
                    skills_dir: baseline.skills_dir,
                    has_path_override: baseline.has_path_override,
                  })
              : undefined
          }
        />
        <AgentPathField
          name={agent.display_name}
          label="项目技能路径"
          value={agent.project_relative_skills_dir ?? ""}
          allowEmpty
          save={(value) =>
            update({
              project_relative_skills_dir: value || null,
              has_project_path_override: true,
            })
          }
          reset={
            !agent.is_custom && baseline && agent.has_project_path_override
              ? () =>
                  update({
                    project_relative_skills_dir:
                      baseline.project_relative_skills_dir,
                    has_project_path_override:
                      baseline.has_project_path_override,
                  })
              : undefined
          }
        />
        <div className="ap-original-meta">
          <span>{agent.category === "lobster" ? "龙虾" : "编码"}</span>
          <span>{agent.is_custom ? "自定义 Agent" : "内置 Agent"}</span>
          <span>{agent.installed ? "已安装" : "未安装"}</span>
          {agent.is_custom && (
            <button onClick={() => setConfirming(true)}>
              <Trash2 size={12} />
              移除自定义 Agent
            </button>
          )}
        </div>
      </div>
      {confirming && (
        <AgentPrototypeDialog
          title="移除自定义 Agent"
          close={() => setConfirming(false)}
        >
          <p className="ap-dialog-help">
            确定移除「{agent.display_name}」？技能目录及其内容会保留。
          </p>
          <footer>
            <button onClick={() => setConfirming(false)}>取消</button>
            <button className="ap-danger" onClick={remove}>
              确认移除
            </button>
          </footer>
        </AgentPrototypeDialog>
      )}
    </details>
  );
}
