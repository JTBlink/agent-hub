// Throwaway layout alternatives, sharing only demonstration state.
import type { ReactNode } from "react";
import { FileText, FolderOpen, Plus, Monitor } from "lucide-react";
import type { Profile } from "./hostsPrototypeData";
type Props = {
  variant: "A" | "B" | "C";
  profiles: Profile[];
  visible: Profile[];
  selected: string;
  active?: Profile;
  system: string;
  filter: string;
  dirty: boolean;
  setFilter: (value: string) => void;
  choose: (id: string, openEditor?: boolean) => void;
  named: (mode: "new") => void;
  badge: (profile: Profile) => ReactNode;
  apply: (profile: Profile) => void;
  editor: ReactNode;
  systemStrip: ReactNode;
};
export function HostsPrototypeVariants({
  variant,
  profiles,
  visible,
  selected,
  active,
  system,
  filter,
  dirty,
  setFilter,
  choose,
  named,
  badge,
  apply,
  editor,
  systemStrip,
}: Props) {
  return (
    <>
      {variant === "A" && (
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
      )}
      {variant === "B" && (
        <div className="hp-environment">
          <div className="hp-current">
            <div className="hp-eyebrow">当前环境</div>
            <div className="hp-current-title">
              <Monitor size={26} />
              <h2>{active?.name ?? "外部修改"}</h2>
              <span className="hp-badge">正在使用</span>
            </div>
            <p>系统文件 /etc/hosts · 同时仅应用一套完整 Hosts</p>
            <div className="hp-toolbar">
              <button
                onClick={() => {
                  choose("system", true);
                }}
              >
                编辑当前系统 Hosts
              </button>
            </div>
            {editor}
          </div>
          <div className="hp-description">
            切换到其他环境 <span>每次仅应用一套完整 Hosts</span>
          </div>
          <div className="hp-cards">
            {profiles.map((p) => (
              <article
                key={p.id}
                className={`${p.content === system ? "is-active" : ""} ${selected === p.id ? "is-editing" : ""}`}
              >
                <FileText size={21} />
                <h3>{p.name}</h3>
                <p>{p.note}</p>
                <code>
                  {
                    p.content
                      .split("\n")
                      .filter((l) => l.trim() && !l.startsWith("#")).length
                  }{" "}
                  条映射
                </code>
                <div>
                  {badge(p)}{" "}
                  {selected === p.id && (
                    <span className="hp-editing-label">正在编辑</span>
                  )}
                </div>
                <footer>
                  <button
                    onClick={() => {
                      choose(p.id, true);
                    }}
                  >
                    {selected === p.id ? "正在编辑" : "编辑方案"}
                  </button>
                  <button
                    className="hp-primary"
                    disabled={
                      p.content === system || (selected === p.id && dirty)
                    }
                    onClick={() => apply(p)}
                  >
                    {p.content === system ? "已应用" : "一键应用"}
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </div>
      )}
      {variant === "C" && (
        <div className="hp-table-layout">
          {systemStrip}
          <div className="hp-table-title">
            <div>
              <h2>Hosts 方案</h2>
              <p>所有配置集中管理，点击方案查看或编辑。</p>
            </div>
            <input
              aria-label="搜索方案"
              placeholder="搜索方案…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="hp-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>方案名称</th>
                  <th>状态</th>
                  <th>映射</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button
                        className="hp-name-button"
                        onClick={() => {
                          choose(p.id, true);
                        }}
                      >
                        <FileText size={15} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.note}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      {badge(p) ?? <span className="hp-muted">未应用</span>}
                    </td>
                    <td>
                      {
                        p.content
                          .split("\n")
                          .filter((l) => l.trim() && !l.startsWith("#")).length
                      }
                    </td>
                    <td>
                      <div className="hp-toolbar">
                        <button
                          onClick={() => {
                            choose(p.id, true);
                          }}
                        >
                          编辑
                        </button>
                        <button
                          disabled={
                            p.content === system || (selected === p.id && dirty)
                          }
                          onClick={() => apply(p)}
                        >
                          {p.content === system ? "已应用" : "应用"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
