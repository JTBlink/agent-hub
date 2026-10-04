import { type ConfigDocument } from "../lib/backend";
import { useLanguage } from "../lib/i18n";
import { createTopologyLayout } from "../lib/topology";
import { BrandGlyph, Icon } from "./AppIcons";
import { getAgentMeta, statusLabel, type Section } from "./shell-presentation";

export function Overview({
  readyCount,
  diagnosticCount,
  configs,
  onNavigate,
}: {
  readyCount: number;
  diagnosticCount: number;
  configs: ConfigDocument[];
  onNavigate: (section: Section) => void;
}) {
  const { t } = useLanguage();
  const topologyAgentIds = Array.from(
    new Set(configs.map((config) => config.agent)),
  );
  const topologyLayout = createTopologyLayout(topologyAgentIds.length);
  const connectionState = (agent: string) => {
    const status = configs.find((config) => config.agent === agent)?.status;
    if (status === "ready") return "ready";
    if (status === "invalid" || status === "unreadable") return "warning";
    return "idle";
  };
  const totalAgents = topologyAgentIds.length;
  const connected = totalAgents > 0 && readyCount === totalAgents;
  const hasAttention = diagnosticCount > 0 || readyCount < totalAgents;
  const healthLabel =
    connected && !diagnosticCount ? t("healthy") : t("attention");
  const healthTone = connected && !diagnosticCount ? "healthy" : "attention";
  return (
    <div className="page overview-page">
      <section className="overview-hero" aria-labelledby="overview-title">
        <div className="overview-hero-copy">
          <div className="overview-kicker">
            <p className="eyebrow">{t("overviewKicker")}</p>
            <span
              className={`overview-status ${healthTone}`}
              aria-label={`本机工作区：${healthLabel}`}
            >
              <i aria-hidden="true" />
              {healthLabel}
            </span>
          </div>
          <h1 id="overview-title">{t("overviewTitle")}</h1>
          <p className="overview-hero-description">
            <span>{t("overviewDescription")}</span>
            <span>{t("overviewDescription2")}</span>
          </p>
          <div className="overview-hero-actions">
            <button
              className={`button button-primary ${hasAttention ? "attention-action" : ""}`}
              onClick={() =>
                onNavigate(hasAttention ? "diagnostics" : "configs")
              }
            >
              <Icon name={hasAttention ? "warning" : "edit"} size={16} />
              {hasAttention ? t("handleAttention") : t("manageConfig")}
              <Icon name="arrow" size={15} />
            </button>
          </div>
        </div>
        <div
          className="overview-snapshot"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`${t("localStatus")}: ${readyCount}/${totalAgents} ${t("connectedAgents")}, ${diagnosticCount} ${t("pendingItems")}`}
        >
          <div className="snapshot-heading">
            <span>{t("localStatus")}</span>
            <span className="snapshot-live">
              <i />
              {t("currentResult")}
            </span>
          </div>
          <div className="snapshot-score">
            <strong>{readyCount}</strong>
            <span>
              / {totalAgents} {t("connectedAgents")}
            </span>
          </div>
          <div className="snapshot-meter" aria-hidden="true">
            <i
              style={{
                width: `${totalAgents ? Math.round((readyCount / totalAgents) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="snapshot-footnote">
            <span className={diagnosticCount ? "has-attention" : ""}>
              {diagnosticCount
                ? `${diagnosticCount} ${t("pendingItems")}`
                : t("noPendingDiagnostics")}
            </span>
          </div>
        </div>
      </section>

      <section className="topology-card" aria-labelledby="topology-title">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">{t("connectionStatus")}</p>
            <h2 id="topology-title">{t("topology")}</h2>
          </div>
          <div className="topology-meta">
            <span className="live-indicator">
              <i />
              {t("localScan")}
            </span>
          </div>
        </div>
        <div
          className="topology"
          style={
            {
              "--topology-height": `${topologyLayout.height}px`,
            } as React.CSSProperties
          }
        >
          <svg
            className="topology-network"
            viewBox={`0 0 100 ${topologyLayout.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="topology-teal" x1="0" x2="1">
                <stop stopColor="#7D8CFF" />
                <stop offset="1" stopColor="#2C9CFF" />
              </linearGradient>
              <linearGradient id="topology-violet" x1="0" x2="1">
                <stop stopColor="#168BFF" />
                <stop offset="1" stopColor="#7185FF" />
              </linearGradient>
              <linearGradient id="topology-amber" x1="0" x2="1">
                <stop stopColor="#42D9B1" />
                <stop offset="1" stopColor="#2C9CFF" />
              </linearGradient>
            </defs>
            {topologyAgentIds.map((agent, index) => {
              const connection = topologyLayout.connections[index];
              return (
                <g key={agent}>
                  <path className="network-rail" d={connection.path} />
                  <path
                    className={`network-flow ${index < 3 ? `flow-${["top", "mid", "bottom"][index]}` : "flow-dynamic"} ${connectionState(agent)}`}
                    d={connection.path}
                  />
                  <ellipse
                    className={`network-pulse ${index < 3 ? `pulse-${["top", "mid", "bottom"][index]}` : "pulse-dynamic"} ${connectionState(agent)}`}
                    cx={connection.pulseX}
                    cy={connection.pulseY}
                    rx="0.55"
                    ry="5"
                  />
                </g>
              );
            })}
          </svg>
          <div
            className="agent-nodes"
            style={
              {
                "--agent-stack-height": `${Math.max(0, topologyLayout.height - 20)}px`,
                "--agent-gap": `${topologyLayout.gap}px`,
                "--agent-node-height": `${topologyLayout.nodeHeight}px`,
              } as React.CSSProperties
            }
          >
            {topologyAgentIds.map((agent) => {
              const config = configs.find((item) => item.agent === agent);
              const meta = getAgentMeta(agent);
              const state = connectionState(agent);
              return (
                <div
                  className={`agent-node ${state === "ready" ? "connected" : state === "warning" ? "attention" : "scanning"}`}
                  key={agent}
                >
                  <div className={`agent-avatar ${meta.tone}`}>{meta.mark}</div>
                  <div>
                    <strong>{meta.name}</strong>
                    <span
                      className={`status-text ${state === "ready" ? "success" : state === "warning" ? "attention" : "muted"}`}
                    >
                      <i />
                      {statusLabel(config?.status)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hub-node">
            <div className="hub-orbit">
              <BrandGlyph size={46} />
            </div>
            <strong>AgentHub</strong>
            <small>{t("hubSubtitle")}</small>
          </div>
        </div>
        <div className="topology-footer">
          <span>
            <i className="footer-signal" />
            {readyCount}/{totalAgents} {t("workspaceConfig")}
          </span>
          <button className="text-button" onClick={() => onNavigate("configs")}>
            {t("viewConfigStatus")} <Icon name="arrow" size={15} />
          </button>
        </div>
      </section>
      <section className="overview-health-grid" aria-label="工作区健康指标">
        <article className="health-panel health-panel-primary">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">{t("workspaceHealth")}</p>
              <h2>{t("safeToWork")}</h2>
            </div>
            <span className={`health-score ${healthTone}`}>
              {readyCount}/{totalAgents}
            </span>
          </div>
          <p className="health-panel-copy">
            {connected && !diagnosticCount
              ? `${totalAgents} ${t("agentsReady")}`
              : t("attentionDescription")}
          </p>
          <div className="health-list">
            <button onClick={() => onNavigate("configs")}>
              <span className="health-list-icon teal">
                <Icon name="sliders" />
              </span>
              <span>
                <strong>{t("configSync")}</strong>
                <small>
                  {readyCount}/{totalAgents} {t("agentsReadyShort")}
                </small>
              </span>
              <Icon name="arrow" size={15} />
            </button>
            <button onClick={() => onNavigate("skills")}>
              <span className="health-list-icon violet">
                <Icon name="spark" />
              </span>
              <span>
                <strong>{t("skillsDirectory")}</strong>
                <small>{t("openSkillsManager")}</small>
              </span>
              <Icon name="arrow" size={15} />
            </button>
            <button onClick={() => onNavigate("diagnostics")}>
              <span
                className={`health-list-icon ${diagnosticCount ? "amber" : "teal"}`}
              >
                <Icon name={diagnosticCount ? "warning" : "check"} />
              </span>
              <span>
                <strong>{t("diagnosticQueue")}</strong>
                <small>
                  {diagnosticCount
                    ? `${diagnosticCount} ${t("pendingItems")}`
                    : t("currentNoIssues")}
                </small>
              </span>
              <Icon name="arrow" size={15} />
            </button>
          </div>
        </article>
        <article className="next-panel">
          <div>
            <p className="eyebrow">{t("secureWrite")}</p>
            <h2>{t("everyChangeReversible")}</h2>
            <p>{t("secureWriteDescription")}</p>
          </div>
          <div className="write-flow" aria-label="安全写入流程">
            <span className="write-flow-step done">
              <i>1</i>
              <b>{t("scan")}</b>
            </span>
            <span className="write-flow-line" />
            <span className="write-flow-step done">
              <i>2</i>
              <b>{t("diff")}</b>
            </span>
            <span className="write-flow-line" />
            <span className="write-flow-step">
              <i>3</i>
              <b>{t("confirm")}</b>
            </span>
            <span className="write-flow-line" />
            <span className="write-flow-step">
              <i>4</i>
              <b>{t("backup")}</b>
            </span>
          </div>
          <button
            className="button button-secondary"
            onClick={() => onNavigate("configs")}
          >
            {t("openConfigCenter")} <Icon name="arrow" size={15} />
          </button>
        </article>
      </section>
    </div>
  );
}
