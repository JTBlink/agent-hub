import { useTranslation } from "react-i18next";
import type { Components } from "react-markdown";
import type { RepositoryTaskDetail } from "../../lib/taskBrowserApi";
import { MarkdownContent } from "../MarkdownContent";
import { TaskStatusBadge } from "./TaskStatusBadge";

export function TaskDevelopmentView({
  detail,
  components,
  onOpen,
}: {
  detail: RepositoryTaskDetail;
  components: Components;
  onOpen: (url: string) => void;
}) {
  const { t } = useTranslation();
  const info = detail.development;
  const pipeline = detail.summary.metadata?.review?.pipeline;
  const checks = [...(pipeline ? [pipeline] : []), ...(info?.checks ?? [])];
  const status = (value: string) =>
    t(`tasks.values.${value.toLowerCase()}`, { defaultValue: value });
  return (
    <>
      {info && info.warnings.length > 0 && (
        <p role="status" className="text-xs text-muted">
          {t("tasks.facts.partial")}{" "}
          {Array.from(new Set(info.warnings))
            .map((section) => t(`tasks.facts.${section}`))
            .join(" / ")}
        </p>
      )}
      {info && info.truncated.length > 0 && (
        <p className="text-xs text-muted">
          {t("tasks.facts.truncated")}{" "}
          {Array.from(new Set(info.truncated))
            .map((section) => t(`tasks.facts.${section}`))
            .join(" / ")}
        </p>
      )}
      {checks.length > 0 && (
        <section
          aria-label={t("tasks.facts.checks")}
          className="space-y-2 border-t border-border-subtle pt-3"
        >
          <h3 className="text-xs font-semibold">{t("tasks.facts.checks")}</h3>
          {checks.map((check, index) => (
            <div
              key={`${check.name}:${index}`}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              <button
                className="min-w-0 truncate text-left text-accent-light disabled:text-secondary"
                disabled={!/^https?:\/\//i.test(check.url)}
                title={check.url}
                onClick={() => onOpen(check.url)}
              >
                {check.name}
              </button>
              <TaskStatusBadge
                state={check.status}
                label={status(check.status)}
              />
              {check.sha && (
                <code className="text-xs text-muted" title={check.sha}>
                  {check.sha.slice(0, 8)}
                </code>
              )}
            </div>
          ))}
        </section>
      )}
      {!!info?.related.length && (
        <section
          aria-label={t("tasks.facts.related")}
          className="space-y-2 border-t border-border-subtle pt-3"
        >
          <h3 className="text-xs font-semibold">{t("tasks.facts.related")}</h3>
          {info.related.map((link) => (
            <button
              key={link.url}
              disabled={!/^https?:\/\//i.test(link.url)}
              title={link.url}
              className="block w-full break-words text-left text-xs text-accent-light disabled:text-muted"
              onClick={() => onOpen(link.url)}
            >
              {link.kind === "closes" ? `${t("tasks.facts.closes")} ` : ""}
              {link.number != null
                ? `${link.kind === "review" && detail.summary.provider === "gitlab" ? "!" : "#"}${link.number} `
                : ""}
              {link.title}
            </button>
          ))}
        </section>
      )}
      {!!info?.reviews.length && (
        <section
          aria-label={t("tasks.facts.reviews")}
          className="space-y-3 border-t border-border-subtle pt-3"
        >
          <h3 className="text-xs font-semibold">{t("tasks.facts.reviews")}</h3>
          {info.reviews.map((review, index) => (
            <div
              key={`${review.author}:${index}`}
              className="space-y-1 text-xs"
            >
              <p className="flex flex-wrap gap-2">
                <span>{review.author}</span>
                <TaskStatusBadge
                  state={review.state}
                  label={status(review.state)}
                />
                {review.submitted_at && (
                  <span className="text-xs text-muted">
                    {new Date(review.submitted_at).toLocaleString()}
                  </span>
                )}
                {review.resolved != null && (
                  <span className="text-muted">
                    {t(
                      review.resolved
                        ? "tasks.facts.resolved"
                        : "tasks.facts.unresolved",
                    )}
                  </span>
                )}
              </p>
              {review.path && (
                <p className="break-all font-mono text-xs text-muted">
                  {review.path}
                  {review.line != null ? `:${review.line}` : ""}
                </p>
              )}
              {review.body && (
                <MarkdownContent
                  content={review.body}
                  components={components}
                />
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
