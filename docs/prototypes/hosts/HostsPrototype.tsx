// Throwaway UI: three Hosts layouts inside the existing settings shell.
// Synthetic data, memory only; no system, editor, or Git mutations.
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Code2,
  Copy,
  FileText,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Save,
  Sun,
  Trash2,
} from "lucide-react";
import { HostsPrototypeVariants } from "./HostsPrototypeVariants";
import { HostsPrototypeModal as Modal } from "./HostsPrototypeModal";
import {
  base,
  initial,
  variants,
  labels,
  type Profile,
  type Variant,
} from "./hostsPrototypeData";
import "./hosts-prototype.css";

export function HostsPrototype() {
  const param = new URLSearchParams(location.search).get("variant");
  const [variant, setVariant] = useState<Variant>(
    variants.includes(param as Variant) ? (param as Variant) : "A",
  );
  const [profiles, setProfiles] = useState(initial);
  const [system, setSystem] = useState(initial[0].content);
  const [selected, setSelected] = useState(param === "B" ? "system" : "dev");
  const [draft, setDraft] = useState(initial[0].content);
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState("准备就绪，所有操作仅影响演示数据");
  const [modal, setModal] = useState<"name" | "editor" | null>(null);
  const [name, setName] = useState("");
  const [nameMode, setNameMode] = useState<
    "new" | "rename" | "copy" | "system"
  >("new");
  const [confirmation, setConfirmation] = useState<{
    text: string;
    run: () => void;
  } | null>(null);
  const [dark, setDark] = useState(
    !document.documentElement.classList.contains("light") &&
      document.documentElement.classList.contains("dark"),
  );
  const profile = profiles.find((p) => p.id === selected);
  const dirty = draft !== (profile?.content ?? system);
  const active = profiles.find((p) => p.content === system);
  const visible = profiles.filter((p) => p.name.includes(filter));
  const time = () =>
    new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  const ask = (text: string, run: () => void) => setConfirmation({ text, run });
  const choose = (id: string, openEditor = false) => {
    if (id === selected) {
      if (openEditor && variant !== "B") setModal("editor");
      return;
    }
    const run = () => {
      setSelected(id);
      setDraft(profiles.find((p) => p.id === id)?.content ?? system);
      if (openEditor && variant !== "B") setModal("editor");
    };
    if (dirty) ask("切换后会放弃尚未保存的编辑。继续切换？", run);
    else run();
  };
  const save = () => {
    if (!profile) return;
    setProfiles((v) =>
      v.map((p) => (p.id === selected ? { ...p, content: draft } : p)),
    );
    setNotice(`「${profile.name}」已保存，系统 Hosts 尚未改变`);
  };
  const apply = (p: Profile) => {
    if (p.content === system) return;
    const run = () => {
      setSystem(p.content);
      if (selected === "system") setDraft(p.content);
      setNotice(`已应用「${p.name}」，配置沿用统一 GitHub 自动备份（模拟）`);
    };
    if (dirty && selected === "system")
      ask("应用方案会替换当前系统草稿。放弃编辑并应用？", run);
    else run();
  };
  const named = (mode: typeof nameMode) => {
    setNameMode(mode);
    setName(
      mode === "rename"
        ? (profile?.name ?? "")
        : mode === "copy"
          ? `${profile?.name} 副本`
          : "",
    );
    setModal("name");
  };
  const create = () => {
    if (!name.trim()) return;
    if (nameMode === "rename") {
      setProfiles((v) =>
        v.map((p) => (p.id === selected ? { ...p, name: name.trim() } : p)),
      );
    } else {
      const id = crypto.randomUUID();
      const content =
        nameMode === "system" ? system : nameMode === "copy" ? draft : base;
      setProfiles((v) => [
        ...v,
        { id, name: name.trim(), note: "自定义方案", content },
      ]);
      setSelected(id);
      setDraft(content);
    }
    setModal(null);
    setNotice("方案已保存到用户配置库");
  };
  const changeVariant = (v: Variant) => {
    setVariant(v);
    const url = new URL(location.href);
    url.searchParams.set("variant", v);
    history.replaceState(null, "", url);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        (e.target instanceof Element &&
          e.target.closest("input,textarea,[contenteditable],dialog")) ||
        document.querySelector("dialog[open]")
      )
        return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.key === "ArrowLeft" ? -1 : 1;
        const next = variants[(variants.indexOf(variant) + step + 3) % 3];
        setVariant(next);
        const url = new URL(location.href);
        url.searchParams.set("variant", next);
        history.replaceState(null, "", url);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [variant]);
  const vscode = () =>
    setNotice(
      `演示：用 VS Code 打开 ${profile ? `~/.agent-hub/user-config/hosts/profiles/${profile.id}/hosts` : "/etc/hosts"}；此处未启动外部程序`,
    );
  const badge = (p: Profile) =>
    p.content === system ? (
      <span className="hp-badge">
        <Check size={11} />
        当前生效
      </span>
    ) : null;
  const editor = (
    <div className="hp-editor">
      <div className="hp-editor-title">
        <div>
          <span className="hp-eyebrow">
            {profile ? "完整 Hosts 方案" : "本机实际内容"}
          </span>
          <h2>
            {profile?.name ?? "当前系统 Hosts"}
            {profile && badge(profile)}
          </h2>
        </div>
        <button onClick={vscode}>
          <Code2 size={14} />
          VS Code 打开
        </button>
      </div>
      <div className="hp-file">
        <FileText size={13} />
        <span>
          {profile
            ? `~/…/user-config/hosts/profiles/${profile.id}/hosts`
            : "/etc/hosts"}
        </span>
        <span>{dirty ? "未保存" : "已保存"}</span>
      </div>
      <div className="hp-code">
        <div aria-hidden="true">
          {draft.split("\n").map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          aria-label="Hosts 内容"
          value={draft}
          readOnly={!profile && variant !== "B"}
          spellCheck={false}
          wrap="off"
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>
      <div className="hp-editor-footer">
        <span>
          {
            draft.split("\n").filter((l) => l.trim() && !l.startsWith("#"))
              .length
          }{" "}
          条映射 · UTF-8
        </span>
        <span>
          {profile
            ? "保存方案后，点击应用才会修改系统"
            : variant === "B"
              ? "保存到系统前沿用现有写入保护"
              : `只读快照 · 最近读取 ${time()}`}
        </span>
      </div>
      <div className="hp-actions">
        {profile ? (
          <>
            <button onClick={() => named("rename")}>重命名</button>
            <button onClick={() => named("copy")}>
              <Copy size={13} />
              复制
            </button>
            <button
              aria-label="删除方案"
              onClick={() =>
                ask(
                  `删除「${profile.name}」？系统 Hosts 和历史备份会保留。`,
                  () => {
                    setProfiles((v) => v.filter((p) => p.id !== selected));
                    setSelected("system");
                    setDraft(system);
                  },
                )
              }
            >
              <Trash2 size={13} />
            </button>
            <span className="hp-spacer" />
            <button disabled={!dirty} onClick={save}>
              <Save size={13} />
              保存方案
            </button>
            <button
              className="hp-primary"
              disabled={dirty || profile.content === system}
              onClick={() => apply(profile)}
            >
              <CheckCheck size={14} />
              {profile.content === system ? "已应用" : "应用到系统"}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setDraft(system);
                setNotice("已重新读取系统 Hosts（模拟）");
              }}
            >
              <RefreshCw size={13} />
              刷新
            </button>
            <span className="hp-spacer" />
            <button className="hp-primary" onClick={() => named("system")}>
              <Plus size={13} />
              另存为方案
            </button>
            {variant === "B" && (
              <button
                className="hp-primary"
                disabled={!dirty}
                onClick={() => {
                  setSystem(draft);
                  setNotice(
                    "系统 Hosts 已保存，沿用统一 GitHub 自动备份（模拟）",
                  );
                }}
              >
                <Save size={13} />
                保存到系统
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
  const systemStrip = (
    <div className="hp-system">
      <span className="hp-system-icon">
        <Monitor size={20} />
      </span>
      <div>
        <strong>当前系统 Hosts</strong>
        <p>
          /etc/hosts <span>·</span>{" "}
          {active ? `与「${active.name}」一致` : "外部修改，未匹配现有方案"}
        </p>
      </div>
      <button
        onClick={() => {
          choose("system", variant !== "A");
        }}
      >
        查看内容
      </button>
    </div>
  );
  return (
    <div className={`hosts-prototype hp-variant-${variant}`}>
      <header className="hp-heading">
        <div>
          <div className="hp-eyebrow">用户配置 / 网络</div>
          <h1>Hosts</h1>
          <p>为不同环境保存完整方案，随时切换。</p>
        </div>
        <div className="hp-toolbar">
          <button
            onClick={() => {
              setDark(!dark);
              document.documentElement.classList.toggle("dark", !dark);
            }}
            aria-label="切换主题"
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button className="hp-primary" onClick={() => named("new")}>
            <Plus size={14} />
            新建方案
          </button>
        </div>
      </header>
      <HostsPrototypeVariants
        variant={variant}
        profiles={profiles}
        visible={visible}
        selected={selected}
        active={active}
        system={system}
        filter={filter}
        dirty={dirty}
        setFilter={setFilter}
        choose={choose}
        named={named}
        badge={badge}
        apply={apply}
        editor={editor}
        systemStrip={systemStrip}
      />
      <div role="status" className="hp-notice">
        {notice}
      </div>
      <details className="hp-demo">
        <summary>原型演示控件与状态</summary>
        <div className="hp-toolbar">
          <button
            onClick={() => {
              const next = system + "\n192.0.2.99 external.example.test\n";
              setSystem(next);
              if (selected === "system") setDraft(next);
              setNotice("检测到外部修改，生效状态已重新核验");
            }}
          >
            模拟系统外部修改
          </button>
        </div>
        <pre>
          {JSON.stringify(
            {
              variant,
              selected,
              active: active?.name ?? "外部修改",
              dirty,
              profiles: profiles.length,
            },
            null,
            2,
          )}
        </pre>
      </details>
      {import.meta.env.DEV && (
        <nav className="hp-switcher" aria-label="原型布局切换">
          <button
            aria-label="上一个布局"
            onClick={() =>
              changeVariant(variants[(variants.indexOf(variant) + 2) % 3])
            }
          >
            <ArrowLeft size={16} />
          </button>
          <span>
            原型 {variant} / {labels[variant]}
          </span>
          <button
            aria-label="下一个布局"
            onClick={() =>
              changeVariant(variants[(variants.indexOf(variant) + 1) % 3])
            }
          >
            <ArrowRight size={16} />
          </button>
        </nav>
      )}
      {modal === "editor" && (
        <Modal title="Hosts 内容" close={() => setModal(null)}>
          {editor}
        </Modal>
      )}
      {modal === "name" && (
        <Modal
          title={nameMode === "rename" ? "重命名方案" : "保存新方案"}
          close={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <label className="hp-form-label">
              方案名称
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：本地开发"
                required
              />
            </label>
            <p className="hp-muted">
              保存到用户配置库，并沿用现有 Git 自动备份。
            </p>
            <footer>
              <button type="button" onClick={() => setModal(null)}>
                取消
              </button>
              <button className="hp-primary" type="submit">
                保存方案
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {confirmation && (
        <Modal title="确认操作" close={() => setConfirmation(null)}>
          <p className="hp-modal-help">{confirmation.text}</p>
          <footer>
            <button onClick={() => setConfirmation(null)}>取消</button>
            <button
              className="hp-primary"
              onClick={() => {
                confirmation.run();
                setConfirmation(null);
              }}
            >
              确认
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
