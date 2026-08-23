import type { ReactNode } from "react";

import type { DiagnosticRecoveryPresentation } from "../lib/diagnostic-recovery-presentation";

type DiagnosticRecoveryPageProps = {
  presentation: DiagnosticRecoveryPresentation;
  warningIcon: ReactNode;
  backIcon: ReactNode;
  onBack: () => void;
  onExecute: () => void;
  busy: boolean;
};

export function DiagnosticRecoveryPage({
  presentation,
  warningIcon,
  backIcon,
  onBack,
  onExecute,
  busy,
}: DiagnosticRecoveryPageProps) {
  return (
    <div className="page recovery-page">
      <button className="recovery-page-back" type="button" onClick={onBack}>
        {backIcon}
        返回诊断列表
      </button>
      <header className="recovery-page-heading">
        <p className="eyebrow">{presentation.eyebrow}</p>
        <h1 id="recovery-page-title" tabIndex={-1}>
          {presentation.title}
        </h1>
        <p>{presentation.description}</p>
      </header>
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
