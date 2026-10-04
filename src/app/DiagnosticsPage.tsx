import { useEffect, useRef, useState } from "react";
import {
  executeDiagnosticRecovery,
  previewDiagnosticRecovery,
  type DiagnosticRecoveryPreview,
  type UnifiedDiagnostic,
} from "../lib/backend";
import {
  diagnosticProblem,
  diagnosticSubject,
} from "../lib/diagnostic-presentation";
import { diagnosticRecoveryPresentation } from "../lib/diagnostic-recovery-presentation";
import { Icon } from "./AppIcons";
import { DiagnosticRecoveryPage } from "./DiagnosticRecoveryPage";
import { type Section } from "./shell-presentation";

export function DiagnosticsPage({
  diagnostics,
  onNavigate,
  onRepair,
  searchQuery,
}: {
  diagnostics: UnifiedDiagnostic[];
  onNavigate: (section: Section) => void;
  onRepair: () => void;
  searchQuery: string;
}) {
  const [recoveryPreview, setRecoveryPreview] =
    useState<DiagnosticRecoveryPreview>();
  const [recoveryDiagnostic, setRecoveryDiagnostic] =
    useState<UnifiedDiagnostic>();
  const [recoveryMessage, setRecoveryMessage] = useState<string>();
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const diagnosticsScrollPosition = useRef({ main: 0, window: 0 });
  const recoveryReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const issueDiagnostics = diagnostics.filter(
    (item) => item.severity !== "info",
  );
  const errorCount = issueDiagnostics.filter(
    (item) => item.severity === "error",
  ).length;
  const warningCount = issueDiagnostics.filter(
    (item) => item.severity === "warning",
  ).length;
  const actionable = issueDiagnostics
    .filter((item) => {
      return (
        !normalizedQuery ||
        [
          item.code,
          diagnosticSubject(item),
          diagnosticProblem(item),
          item.impact,
          item.nextAction,
          item.resourcePath ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      );
    })
    .sort((left, right) => {
      const severityRank = { error: 0, warning: 1, info: 2 };
      const leftCodeRank = left.code === "skill:symlink-skipped" ? 2 : 0;
      const rightCodeRank = right.code === "skill:symlink-skipped" ? 2 : 0;
      return (
        severityRank[left.severity] - severityRank[right.severity] ||
        leftCodeRank - rightCodeRank ||
        diagnosticSubject(left).localeCompare(diagnosticSubject(right), "zh-CN")
      );
    });
  async function previewRecovery(
    item: UnifiedDiagnostic,
    trigger?: HTMLButtonElement,
  ) {
    const main = document.querySelector<HTMLElement>(".main-content");
    diagnosticsScrollPosition.current = {
      main: main?.scrollTop ?? 0,
      window: window.scrollY,
    };
    recoveryReturnFocusRef.current = trigger ?? null;
    setRecoveryBusy(true);
    setRecoveryMessage(undefined);
    setRecoveryPreview(undefined);
    setRecoveryDiagnostic(undefined);
    try {
      const preview = await previewDiagnosticRecovery({
        diagnosticCode: item.code,
        resourcePath: item.resourcePath ?? undefined,
      });
      setRecoveryPreview(preview);
      setRecoveryDiagnostic(item);
      window.requestAnimationFrame(() => {
        main?.scrollTo({ top: 0 });
        window.scrollTo({ top: 0 });
      });
    } catch {
      setRecoveryMessage("该问题需要在对应功能中手动处理，请按建议打开详情。");
    } finally {
      setRecoveryBusy(false);
    }
  }
  useEffect(() => {
    if (!recoveryMessage) return;
    document.getElementById("recovery-message")?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [recoveryMessage]);
  const recoveryPresentation = recoveryPreview
    ? diagnosticRecoveryPresentation(recoveryPreview, recoveryDiagnostic)
    : undefined;
  useEffect(() => {
    if (!recoveryPresentation) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("recovery-page-title")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [recoveryPresentation]);
  async function executeRecovery() {
    if (!recoveryPreview || recoveryBusy) return;
    setRecoveryBusy(true);
    try {
      const result = await executeDiagnosticRecovery({
        diagnosticCode: recoveryPreview.plan.diagnosticCode,
        resourcePath: recoveryPreview.plan.resourcePath ?? undefined,
        action: recoveryPreview.plan.action,
        recoveryId: recoveryPreview.recoveryId,
        previewed: true,
        confirmed: recoveryPreview.plan.confirmationRequired,
      });
      setRecoveryMessage(
        recoveryPresentation?.readOnly
          ? "扫描完成，诊断结果已刷新；没有修改任何文件。"
          : result.outcome === "applied"
            ? "修复已应用，并已刷新诊断。"
            : "安全恢复已执行，并已刷新诊断。",
      );
      setRecoveryPreview(undefined);
      setRecoveryDiagnostic(undefined);
      onRepair();
    } catch {
      setRecoveryMessage("恢复未执行：状态可能已变化，请重新扫描后预览。");
    } finally {
      setRecoveryBusy(false);
    }
  }
  function closeRecoveryPage() {
    const main = document.querySelector<HTMLElement>(".main-content");
    setRecoveryPreview(undefined);
    setRecoveryDiagnostic(undefined);
    window.requestAnimationFrame(() => {
      main?.scrollTo({ top: diagnosticsScrollPosition.current.main });
      window.scrollTo({ top: diagnosticsScrollPosition.current.window });
      recoveryReturnFocusRef.current?.focus();
      recoveryReturnFocusRef.current = null;
    });
  }
  if (recoveryPreview && recoveryPresentation) {
    return (
      <DiagnosticRecoveryPage
        presentation={recoveryPresentation}
        warningIcon={
          <Icon
            name={recoveryPresentation.readOnly ? "check" : "warning"}
            size={15}
          />
        }
        onBack={closeRecoveryPage}
        onExecute={() => void executeRecovery()}
        busy={recoveryBusy}
      />
    );
  }
  return (
    <div className="page">
      <header className="diagnostics-page-heading">
        <div>
          <p className="eyebrow">运行状态 / Diagnostics</p>
          <h1>诊断中心</h1>
          <p>集中查看需要确认的配置和存储问题。</p>
        </div>
        <dl className="diagnostics-summary" aria-label="诊断问题统计">
          <div className="total">
            <dt>待处理</dt>
            <dd>{issueDiagnostics.length}</dd>
          </div>
          <div className="error">
            <dt>错误</dt>
            <dd>{errorCount}</dd>
          </div>
          <div className="warning">
            <dt>警告</dt>
            <dd>{warningCount}</dd>
          </div>
        </dl>
      </header>
      {normalizedQuery && (
        <p className="diagnostics-filter-result" role="status">
          当前搜索显示 {actionable.length} / {issueDiagnostics.length} 项问题
        </p>
      )}
      {recoveryMessage && (
        <div
          className="alert alert-warning"
          id="recovery-message"
          role="status"
          aria-live="polite"
        >
          <Icon name="warning" />
          <span>{recoveryMessage}</span>
        </div>
      )}
      {actionable.length ? (
        <div className="diagnostic-list">
          {actionable.map((item) => (
            <article
              className={`diagnostic-card ${item.severity}`}
              key={`${item.code}-${item.resourcePath ?? "storage"}`}
            >
              <div className="diagnostic-icon">
                <Icon
                  name={item.severity === "error" ? "warning" : "file"}
                  size={18}
                />
              </div>
              <div className="diagnostic-copy">
                <div>
                  <strong>{diagnosticSubject(item)}</strong>
                  <span className="diagnostic-severity">
                    {item.severity === "error" ? "错误" : "警告"}
                  </span>
                </div>
                <p>{diagnosticProblem(item)}</p>
                <small>影响：{item.impact}</small>
                <small>建议：{item.nextAction}</small>
                <code className="diagnostic-code">{item.code}</code>
                {item.resourcePath && (
                  <span className="diagnostic-resource-path">
                    <code>{item.resourcePath}</code>
                    {item.code === "skill:symlink-skipped" && (
                      <Icon name="link" size={14} />
                    )}
                  </span>
                )}
              </div>
              <div className="diagnostic-actions">
                {item.fixSafety !== "manual" &&
                  !item.kind.includes("config") && (
                    <button
                      className="button button-secondary"
                      disabled={recoveryBusy}
                      onClick={(event) =>
                        void previewRecovery(item, event.currentTarget)
                      }
                    >
                      查看处理方案
                    </button>
                  )}
                <button
                  className="button button-ghost"
                  onClick={() => {
                    if (item.code.startsWith("skill:")) {
                      onNavigate("skills");
                      return;
                    }
                    onNavigate(item.agent ? "configs" : "settings");
                  }}
                >
                  {item.code.startsWith("skill:")
                    ? "打开 Skills 管理"
                    : "查看详情"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : normalizedQuery ? (
        <div className="empty-page compact">
          <div className="empty-icon">
            <Icon name="search" size={27} />
          </div>
          <h2>没有匹配的诊断</h2>
          <p>清除搜索或换一个诊断码、文件路径关键词。</p>
        </div>
      ) : (
        <div className="empty-page">
          <div className="empty-icon">
            <Icon name="check" size={27} />
          </div>
          <h2>一切看起来很好</h2>
          <p>
            当前扫描没有发现需要处理的错误或警告。你可以继续管理配置或 Skills。
          </p>
          <button
            className="button button-primary"
            onClick={() => onNavigate("configs")}
          >
            打开配置中心
          </button>
        </div>
      )}
    </div>
  );
}
