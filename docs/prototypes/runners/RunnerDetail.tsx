import { X, Server, AlertCircle } from "lucide-react";
import { taskPlatforms } from "@app/platforms";
import type { Runner } from "./demo-data";
import { Status } from "./Status";
export function RunnerDetail({
  r,
  projectName,
  onClose,
}: {
  r: Runner;
  projectName: string;
  onClose: () => void;
}) {
  return (
    r && (
      <aside className="runner-detail">
        <div className="detail-top">
          <span>Runner 详情</span>
          {
            <button aria-label="关闭详情" onClick={onClose}>
              <X size={16} />
            </button>
          }
        </div>
        <div className={`machine ${r.state}`}>
          <Server size={32} />
        </div>
        <h2>{r.name}</h2>
        <div className="detail-badges">
          <Status runner={r} />
          <span className="muted">#{r.id}</span>
          {r.paused && <span className="warning">已暂停</span>}
        </div>
        <dl>
          {[
            [
              "平台",
              taskPlatforms.find((platform) => platform.id === r.platform)
                ?.label ?? r.platform,
            ],
            ["主机", r.host],
            ["可用项目", projectName],
            ["作用域", r.scope],
            ["操作系统", r.os],
            ["任务状态", r.work],
            ["最后联系", r.seen],
            [
              "接收任务",
              r.state === "offline"
                ? "离线，无法接收"
                : r.paused
                  ? "已暂停"
                  : "还需满足标签与分支规则",
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <h3>标签</h3>
        <div className="tags">
          {r.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="detail-note">
          <AlertCircle size={16} />
          <p>
            {r.state === "offline"
              ? "当前离线。请先在执行机检查 Runner 服务与网络连接。"
              : r.paused
                ? "Runner 仍在线，但已暂停接收新任务。"
                : "在线表示平台可联系到 Runner。任务能否执行，还取决于标签、权限与保护分支规则。"}
          </p>
        </div>
        <p className="muted small">
          平台未提供的字段显示为未知，不推测空闲容量。
        </p>
      </aside>
    )
  );
}
