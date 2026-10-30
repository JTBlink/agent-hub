import { useId } from "react";
import { useTranslation } from "react-i18next";
import manifest from "../../../docs/examples/automation-task/task.json?raw";
import script from "../../../docs/examples/automation-task/scripts/run.sh?raw";

const structure =
  "automations/\n└── example-task/\n    ├── task.json\n    └── scripts/\n        └── run.sh";

/** Keep the visible example identical to the package validated by the core. */
export function AutomationGitFormatHelp() {
  const { t } = useTranslation();
  const title = useId();
  return (
    <section
      aria-labelledby={title}
      className="space-y-3 rounded-lg border border-border-subtle bg-background p-3 text-[12px] leading-6"
    >
      <h3 id={title} className="font-medium text-secondary">
        {t("discovery.gitFormatTitle")}
      </h3>
      <p className="text-muted">{t("discovery.gitFormatEntry")}</p>
      <div className="grid gap-3 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <pre
          aria-label={t("discovery.gitFormatStructure")}
          className="overflow-x-auto rounded-md bg-bg-secondary p-3 text-secondary"
        >
          {structure}
        </pre>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          {[
            "gitFormatScan",
            "gitFormatFiles",
            "gitFormatPlatform",
            "gitFormatPortable",
          ].map((key) => (
            <li key={key}>{t(`discovery.${key}`)}</li>
          ))}
        </ul>
      </div>
      <details className="border-t border-border-subtle pt-2">
        <summary className="cursor-pointer font-medium text-secondary focus-visible:ring-2 focus-visible:ring-accent">
          {t("discovery.gitFormatExample")}
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-muted">{t("discovery.gitFormatExampleHelp")}</p>
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="font-mono text-secondary">task.json</p>
              <pre className="mt-1 overflow-x-auto rounded-md bg-bg-secondary p-3 text-secondary">
                <code>{manifest}</code>
              </pre>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-secondary">scripts/run.sh</p>
              <pre className="mt-1 overflow-x-auto rounded-md bg-bg-secondary p-3 text-secondary">
                <code>{script}</code>
              </pre>
            </div>
          </div>
          <p className="text-muted">{t("discovery.gitFormatLimits")}</p>
          <p className="text-muted">{t("discovery.gitFormatWindows")}</p>
        </div>
      </details>
      <details className="border-t border-border-subtle pt-2">
        <summary className="cursor-pointer font-medium text-secondary focus-visible:ring-2 focus-visible:ring-accent">
          {t("discovery.gitFormatUrls")}
        </summary>
        <div className="mt-3 space-y-2 text-muted">
          <p>{t("discovery.gitFormatRepositoryUrl")}</p>
          <code className="block break-all text-secondary">
            https://example.invalid/team/automations.git
          </code>
          <p>{t("discovery.gitFormatTreeUrl")}</p>
          <code className="block break-all text-secondary">
            https://github.com/example-org/automation-tasks/tree/main/automations/example-task
          </code>
          <p>{t("discovery.gitFormatReference")}</p>
        </div>
      </details>
    </section>
  );
}
