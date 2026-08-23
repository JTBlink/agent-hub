import { useEffect, useState } from "react";
import type {
  DeepLinkInstallRequest,
  DeepLinkResolution,
} from "../lib/deep-link";
import { resolveDeepLinkInstall } from "../lib/deep-link";
import {
  browseSkillSource,
  planSkillInstall,
  applySkillInstall,
} from "../lib/backend";
import type { SkillInstallPlanPreview } from "../lib/backend";

interface Props {
  request: DeepLinkInstallRequest;
  onDismiss: () => void;
  onInstalled: () => void;
}

type Phase =
  | "resolving"
  | "resolved"
  | "browsing"
  | "planning"
  | "confirming"
  | "installing"
  | "done"
  | "error";

export function DeepLinkInstallPanel({
  request,
  onDismiss,
  onInstalled,
}: Props) {
  const [phase, setPhase] = useState<Phase>("resolving");
  const [resolution, setResolution] = useState<DeepLinkResolution>();
  const [plan, setPlan] = useState<SkillInstallPlanPreview>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    resolveDeepLinkInstall(request.pluginName, request.marketplace)
      .then((res) => {
        if (cancelled) return;
        setResolution(res);
        setPhase("resolved");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [request.pluginName, request.marketplace]);

  async function handleInstall() {
    if (!resolution) return;
    try {
      setPhase("browsing");
      const browse = await browseSkillSource(resolution.sourceRequest);
      const installableSkill = browse.skills.find((s) => s.installable);
      if (!installableSkill) {
        setError("来源中未找到可安装的 Skill");
        setPhase("error");
        return;
      }
      setPhase("planning");
      const installPlan = await planSkillInstall({
        request: resolution.sourceRequest,
        skillPath: installableSkill.relativePath,
        agent: "claude-code",
        scope: "global",
      });
      setPlan(installPlan);
      setPhase("confirming");
    } catch (err) {
      setError(String(err));
      setPhase("error");
    }
  }

  async function handleConfirm() {
    if (!plan) return;
    try {
      setPhase("installing");
      await applySkillInstall(plan.planId);
      setPhase("done");
      onInstalled();
    } catch (err) {
      setError(String(err));
      setPhase("error");
    }
  }

  return (
    <div className="skill-install-plan deep-link-panel">
      <div>
        <span className="eyebrow">外部安装请求</span>
        <h3>{resolution?.pluginName ?? request.pluginName}</h3>
        {resolution?.description && <p>{resolution.description}</p>}
      </div>

      {phase === "resolving" && (
        <p className="status-text">正在解析插件信息…</p>
      )}

      {phase === "resolved" && resolution && (
        <>
          <dl>
            {resolution.author && (
              <div>
                <dt>作者</dt>
                <dd>{resolution.author}</dd>
              </div>
            )}
            {resolution.category && (
              <div>
                <dt>分类</dt>
                <dd>{resolution.category}</dd>
              </div>
            )}
            <div>
              <dt>来源</dt>
              <dd>{request.marketplace}</dd>
            </div>
          </dl>
          <div className="skill-install-plan-actions">
            <button className="button button-ghost" onClick={onDismiss}>
              取消
            </button>
            <button className="button button-primary" onClick={handleInstall}>
              安装到 Claude Code（全局）
            </button>
          </div>
        </>
      )}

      {(phase === "browsing" ||
        phase === "planning" ||
        phase === "installing") && (
        <p className="status-text">
          {phase === "browsing" && "正在获取来源…"}
          {phase === "planning" && "正在生成安装计划…"}
          {phase === "installing" && "正在安装…"}
        </p>
      )}

      {phase === "confirming" && plan && (
        <>
          <dl>
            <div>
              <dt>文件</dt>
              <dd>{plan.plan.files.length} 个受管文件</dd>
            </div>
            <div>
              <dt>目标路径</dt>
              <dd className="mono">{plan.plan.targetDirectory}</dd>
            </div>
          </dl>
          <div className="skill-install-plan-actions">
            <button className="button button-ghost" onClick={onDismiss}>
              取消
            </button>
            <button className="button button-primary" onClick={handleConfirm}>
              确认安装
            </button>
          </div>
        </>
      )}

      {phase === "done" && (
        <>
          <p className="status-text">安装成功</p>
          <div className="skill-install-plan-actions">
            <button className="button button-primary" onClick={onDismiss}>
              完成
            </button>
          </div>
        </>
      )}

      {phase === "error" && (
        <>
          <p className="status-text error-text">{error}</p>
          <div className="skill-install-plan-actions">
            <button className="button button-ghost" onClick={onDismiss}>
              关闭
            </button>
          </div>
        </>
      )}
    </div>
  );
}
