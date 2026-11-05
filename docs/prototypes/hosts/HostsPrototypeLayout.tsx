import type { ReactNode } from "react";
import { FileText, FolderOpen, Plus } from "lucide-react";
import type { Profile } from "./hostsPrototypeData";
type Props = {
  profiles: Profile[];
  visible: Profile[];
  selected: string;
  filter: string;
  setFilter: (value: string) => void;
  choose: (id: string) => void;
  named: (mode: "new") => void;
  badge: (profile: Profile) => ReactNode;
  editor: ReactNode;
  systemStrip: ReactNode;
};
export function HostsPrototypeLayout({
  profiles,
  visible,
  selected,
  filter,
  setFilter,
  choose,
  named,
  badge,
  editor,
  systemStrip,
}: Props) {
  return (
    <>
      <div className="hp-description">
        方案与编辑器 <span>选择方案查看内容，应用前自动备份系统原文。</span>
      </div>
      {systemStrip}
      <div className="hp-split">
        <aside className="hp-profiles">
          <div className="hp-list-heading">
            我的方案 <span>{profiles.length}</span>
          </div>
          <input
            aria-label="搜索方案"
            placeholder="搜索方案…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {visible.map((p) => (
            <button
              key={p.id}
              className={`hp-profile ${selected === p.id ? "is-selected" : ""}`}
              onClick={() => choose(p.id)}
            >
              <FileText size={16} />
              <span>
                <strong>{p.name}</strong>
                <small>{p.note}</small>
                {badge(p)}
              </span>
            </button>
          ))}
          {!visible.length && <p>没有匹配的方案</p>}
          <button className="hp-add" onClick={() => named("new")}>
            <Plus size={14} />
            添加方案
          </button>
          <div className="hp-library">
            <FolderOpen size={14} />
            <span>
              用户配置库
              <br />
              <code>~/…/user-config/hosts/</code>
            </span>
          </div>
        </aside>
        {editor}
      </div>
    </>
  );
}
