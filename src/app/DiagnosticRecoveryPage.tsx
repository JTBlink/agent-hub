import type { ReactNode } from "react";

import type { DiagnosticRecoveryPresentation } from "../lib/diagnostic-recovery-presentation";
import { PageNavigation } from "./PageNavigation";

type DiagnosticRecoveryPageProps = {
  presentation: DiagnosticRecoveryPresentation;
  warningIcon: ReactNode;
  onBack: () => void;
  onExecute: () => void;
  busy: boolean;
};

export function DiagnosticRecoveryPage({
  presentation,
  warningIcon,
  onBack,
  onExecute,
  busy,
}: DiagnosticRecoveryPageProps) {
  return (
    <div className="page recovery-page">
      <PageNavigation
        backLabel="返回诊断列表"
        onBack={onBack}
        eyebrow={presentation.eyebrow}
        title={presentation.title}
        titleId="recovery-page-title"
        titleTabIndex={-1}
        description={presentation.description}
      />
      {presentation.details.length > 0 && (
        <dl className="recovery-page-details">
          {presentation.details.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd className={detail.mono ? "mono" : undefined}>
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {presentation.effects.length > 0 && (
        <section className="recovery-page-effects">
          <h2>执行后会</h2>
          <ul>
            {presentation.effects.map((effect) => (
              <li key={effect}>{effect}</li>
            ))}
          </ul>
        </section>
      )}
      <p
        className={
          "recovery-page-safety " + (presentation.readOnly ? "safe" : "")
        }
      >
        {warningIcon}
        {presentation.safetyNote}
      </p>
      <footer className="recovery-page-actions">
        <button className="button button-ghost" type="button" onClick={onBack}>
          返回诊断列表
        </button>
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={onExecute}
        >
          {busy ? "执行中…" : presentation.actionLabel}
        </button>
      </footer>
    </div>
  );
}
