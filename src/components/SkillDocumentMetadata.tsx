import { useTranslation } from "react-i18next";
import type { SkillDocumentField } from "../lib/skillDocument";

export function SkillDocumentMetadata({
  fields,
  rawMetadata,
}: {
  fields: SkillDocumentField[];
  rawMetadata?: string;
}) {
  const { t } = useTranslation();
  if (fields.length === 0 && !rawMetadata) return null;
  const labels: Record<string, string> = {
    name: t("mySkills.documentMetadata.name"),
    description: t("mySkills.documentMetadata.description"),
    summary: t("mySkills.documentMetadata.summary"),
    version: t("dashboard.version"),
    license: t("mySkills.documentMetadata.license"),
    author: t("mySkills.documentMetadata.author"),
    compatibility: t("mySkills.documentMetadata.compatibility"),
  };
  return (
    <section
      aria-label={t("mySkills.documentMetadata.title")}
      className="mb-5 rounded-xl border border-border-subtle bg-surface/70 p-4"
    >
      <h3 className="mb-3 text-[13px] font-medium text-primary">
        {t("mySkills.documentMetadata.title")}
      </h3>
      {rawMetadata ? (
        <pre className="whitespace-pre-wrap break-words font-mono text-[12px] text-secondary">
          {rawMetadata}
        </pre>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2">
          {fields.map(({ key, value }) => {
            const labelKey = key.replace(/^metadata\./, "");
            return (
              <div
                key={key}
                className={`min-w-0 ${["summary", "description"].includes(labelKey) || value.includes("\n") ? "sm:col-span-2" : ""}`}
              >
                <dt className="text-[12px] text-muted" title={key}>
                  {Object.hasOwn(labels, labelKey) ? labels[labelKey] : key}
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-secondary">
                  {value}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
