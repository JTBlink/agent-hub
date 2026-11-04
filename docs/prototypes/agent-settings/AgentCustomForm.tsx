// Mirrors the existing custom Agent fields; adds only the editable launch instruction.
import { useState } from "react";
import { FolderOpen, X } from "lucide-react";
import { AgentDirectoryPicker } from "./AgentPrototypeDialog";
import type { PrototypeAgent } from "./agentData";
export function AgentCustomForm({
  close,
  add,
}: {
  close: () => void;
  add: (agent: PrototypeAgent) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState("");
  const [skills, setSkills] = useState("");
  const [project, setProject] = useState("");
  const [instruction, setInstruction] = useState("");
  return (
    <form
      className="ap-custom-form"
      onSubmit={(event) => {
        event.preventDefault();
        add({
          key: `custom-${Date.now()}`,
          display_name: name.trim(),
          skills_dir: skills.trim(),
          project_relative_skills_dir: project.trim() || null,
          instruction,
          installed: true,
          enabled: true,
          is_custom: true,
          has_path_override: false,
          has_project_path_override: false,
          category: "coding",
        });
      }}
    >
      <header>
        <strong>添加自定义 Agent</strong>
        <button type="button" aria-label="取消添加" onClick={close}>
          <X size={15} />
        </button>
      </header>
      <label>
        Agent 名称
        <input
          aria-label="Agent 名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <label>
        技能目录
        <div className="ap-custom-path">
          <input
            aria-label="技能目录"
            value={skills}
            placeholder="~/custom-agent/skills"
            onChange={(event) => setSkills(event.target.value)}
            required
          />
          <button
            type="button"
            aria-label="选择技能目录"
            onClick={() => setPicking(true)}
          >
            <FolderOpen size={14} />
            选择文件夹
          </button>
        </div>
      </label>
      <label>
        项目技能路径
        <input
          aria-label="项目技能路径"
          value={project}
          placeholder=".custom-agent/skills"
          onChange={(event) => setProject(event.target.value)}
        />
      </label>
      <label>
        启动指令
        <input
          aria-label="启动指令"
          value={instruction}
          placeholder="custom-agent --option"
          onChange={(event) => setInstruction(event.target.value)}
        />
      </label>
      {picking && (
        <AgentDirectoryPicker
          value={skills}
          close={() => setPicking(false)}
          choose={(path) => {
            setSkills(path);
            setPicking(false);
          }}
        />
      )}
      <footer>
        <button type="button" onClick={close}>
          取消
        </button>
        <button type="submit" disabled={!name.trim() || !skills.trim()}>
          添加 Agent
        </button>
      </footer>
    </form>
  );
}
