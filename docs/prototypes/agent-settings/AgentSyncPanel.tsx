import { Cloud, CloudOff, GitBranch, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  useAgentSyncPrototype,
  type SyncScenario,
} from "./useAgentSyncPrototype";
import { instructionFor } from "./agentLaunchDocument";
const scenarios: { mode: SyncScenario; label: string }[] = [
  { mode: "success", label: "正常同步" },
  { mode: "failure", label: "连接失败" },
  { mode: "conflict", label: "两端冲突" },
  { mode: "disconnected", label: "未连接仓库" },
];
export function AgentSyncPanel({ expanded = false }: { expanded?: boolean }) {
  const sync = useAgentSyncPrototype();
  const navigate = useNavigate();
  const disconnected = sync.scenario === "disconnected";
  const text = disconnected
    ? "尚未连接 Git 备份"
    : sync.phase === "syncing"
      ? "正在同步启动配置…"
      : sync.phase === "error"
        ? "同步失败，修改已保留"
        : sync.phase === "conflict"
          ? "检测到配置冲突"
          : sync.dirty
            ? "启动配置待同步"
            : sync.completed
              ? "启动配置已同步（演示）"
              : "启动配置与 Git 备份一致（演示）";
  const busy = sync.phase === "syncing";
  return (
    <div className="ap-sync-panel">
      <div className="ap-sync-bar" role="status" aria-live="polite">
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : disconnected ? (
          <CloudOff size={15} />
        ) : (
          <Cloud size={15} />
        )}
        <span>{text}</span>
        {!expanded && (
          <button onClick={() => navigate({ hash: "#backup" })}>
            同步与备份
          </button>
        )}
        <button
          className="ap-sync-action"
          disabled={busy || disconnected || sync.phase === "conflict"}
          onClick={() => void sync.sync()}
        >
          {busy ? "同步中…" : sync.phase === "error" ? "重试同步" : "立即同步"}
        </button>
      </div>
      {sync.phase === "error" && (
        <p className="ap-sync-message">
          演示网络连接失败。当前启动指令和详细设置均保留，可以重试。
        </p>
      )}
      {sync.phase === "conflict" && sync.remote && (
        <div className="ap-sync-conflict">
          <strong>Codex 启动指令在两端均有修改</strong>
          <label>
            本地配置<code>{instructionFor(sync.document, "codex")}</code>
          </label>
          <label>
            远端配置<code>{instructionFor(sync.remote, "codex")}</code>
          </label>
          <div>
            <button disabled={busy} onClick={() => void sync.keepLocal()}>
              保留本地并同步
            </button>
            <button onClick={sync.acceptRemote}>使用远端配置</button>
          </div>
        </div>
      )}
      {expanded && (
        <>
          <div className="ap-backup-description">
            <GitBranch size={16} />
            <div>
              <strong>沿用现有 Git 同步备份</strong>
              <p>
                同步启动指令与默认 Agent；安装检测、认证信息和运行状态留在本机。
              </p>
              <p>
                修改详细设置不会被启动配置覆盖；同步不会重启已运行的 Agent。
              </p>
            </div>
          </div>
          {disconnected && (
            <button
              className="ap-connect-demo"
              onClick={() => sync.chooseScenario("success")}
            >
              连接演示仓库
            </button>
          )}
          <p className="ap-sync-message">
            当前有 {Object.keys(sync.document.instructions).length} 个 Agent
            的启动指令覆盖默认值。
          </p>
          <details className="ap-scenarios">
            <summary role="button">原型场景</summary>
            <div>
              {scenarios.map((item) => (
                <button
                  key={item.mode}
                  disabled={busy}
                  aria-pressed={sync.scenario === item.mode}
                  onClick={() => sync.chooseScenario(item.mode)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p>仅演示状态，不会保存配置或访问 GitHub。</p>
          </details>
          <button
            className="ap-return-agents"
            onClick={() => navigate({ hash: "#agents" })}
          >
            返回智能体设置
          </button>
        </>
      )}
    </div>
  );
}
export function AgentBackupPrototype() {
  return (
    <section className="ap-page">
      <header className="ap-heading">
        <div>
          <h2>同步与备份</h2>
          <p>Agent 启动配置同步 · 原型</p>
        </div>
      </header>
      <AgentSyncPanel expanded />
    </section>
  );
}
