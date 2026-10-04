import { useState } from "react";
import {
  previewConfigRestore,
  restoreConfigHistory,
  type ConfigEditPreview,
  type ConfigHistoryRecord,
} from "../lib/backend";
import { Icon } from "./AppIcons";
import { agentMeta, type Section } from "./shell-presentation";

export function HistoryPage({
  history,
  onNavigate,
  onChanged,
  searchQuery,
}: {
  history: ConfigHistoryRecord[];
  onNavigate: (section: Section) => void;
  onChanged: () => void;
  searchQuery: string;
}) {
  const [selected, setSelected] = useState<ConfigHistoryRecord>();
  const [restorePreview, setRestorePreview] = useState<ConfigEditPreview>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleHistory = normalizedQuery
    ? history.filter((entry) =>
        [
          agentMeta[entry.agent].name,
          entry.path,
          entry.operationType,
          entry.scope,
          entry.result,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : history;
  async function previewRestore(entry: ConfigHistoryRecord) {
    setBusy(true);
    setMessage(undefined);
    try {
      setSelected(entry);
      setRestorePreview(await previewConfigRestore(entry.id));
    } catch {
      setMessage("无法生成恢复 Diff。请先重新扫描对应配置。");
    } finally {
      setBusy(false);
    }
  }
  async function confirmRestore() {
    if (!selected || !restorePreview || busy) return;
    setBusy(true);
    try {
      await restoreConfigHistory(selected.id, restorePreview.before.checksum);
      setMessage("配置已从历史备份恢复，并为恢复前内容创建了新备份。");
      setSelected(undefined);
      setRestorePreview(undefined);
      onChanged();
    } catch {
      setMessage("恢复失败：配置可能已被外部修改。重新扫描并检查最新 Diff。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <h1 className="sr-only">变更历史</h1>
      {message && (
        <div className="alert alert-warning" role="status">
          <Icon name="warning" />
          <span>{message}</span>
        </div>
      )}
      {visibleHistory.length ? (
        <div className="history-list">
          {visibleHistory.map((entry) => (
            <article className="history-row" key={entry.id}>
              <div
                className={`agent-avatar small ${agentMeta[entry.agent].tone}`}
              >
                {agentMeta[entry.agent].mark}
              </div>
              <div className="history-copy">
                <div>
                  <strong>
                    {entry.operationType === "rollback"
                      ? "恢复配置"
                      : "编辑配置"}
                  </strong>
                  <span className={`scope-pill ${entry.scope}`}>
                    {entry.scope === "global" ? "全局" : "工作空间"}
                  </span>
                </div>
                <span>{entry.path}</span>
                <small>
                  {new Date(
                    `${entry.createdAt.replace(" ", "T")}Z`,
                  ).toLocaleString("zh-CN")}{" "}
                  · {entry.result === "succeeded" ? "成功" : "失败"}
                </small>
              </div>
              <button
                className="button button-ghost"
                disabled={busy || entry.result !== "succeeded"}
                onClick={() => void previewRestore(entry)}
              >
                预览恢复
              </button>
            </article>
          ))}
        </div>
      ) : normalizedQuery ? (
        <div className="empty-page compact">
          <div className="empty-icon">
            <Icon name="search" size={27} />
          </div>
          <h2>没有匹配的变更记录</h2>
          <p>可以按 Agent 名称、配置路径或操作类型搜索。</p>
        </div>
      ) : (
        <div className="empty-page">
          <div className="empty-icon">
            <Icon name="history" size={27} />
          </div>
          <h2>还没有变更记录</h2>
          <p>完成第一次配置写入后，备份和恢复入口会显示在这里。</p>
          <button
            className="button button-primary"
            onClick={() => onNavigate("configs")}
          >
            打开配置中心
          </button>
        </div>
      )}
      {selected && restorePreview && (
        <section className="restore-panel" aria-labelledby="restore-title">
          <div className="editor-header">
            <div>
              <span className="eyebrow">恢复确认</span>
              <strong id="restore-title">
                恢复 {agentMeta[selected.agent].name} 配置
              </strong>
            </div>
            <button
              className="icon-button"
              aria-label="关闭恢复预览"
              onClick={() => {
                setSelected(undefined);
                setRestorePreview(undefined);
              }}
            >
              <Icon name="close" />
            </button>
          </div>
          <p>确认后会把当前文件再次备份，再原子替换为所选历史版本。</p>
          <pre>{restorePreview.diff || "所选备份与当前内容一致。"}</pre>
          <div className="editor-footer">
            <button
              className="button button-ghost"
              onClick={() => {
                setSelected(undefined);
                setRestorePreview(undefined);
              }}
            >
              取消
            </button>
            <button
              className="button button-primary"
              disabled={!restorePreview.changed || busy}
              onClick={() => void confirmRestore()}
            >
              {busy ? "恢复中…" : "确认恢复并备份"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
