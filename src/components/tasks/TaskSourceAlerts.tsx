import { useTranslation } from "react-i18next";
import { type TaskBinding } from "../../lib/tauri";
import { type TaskSource } from "./useRepositoryTasks";

export function TaskSourceAlerts({
  sources,
  load,
}: {
  sources: TaskSource[];
  load: (binding: TaskBinding, page: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <>
      {sources
        .filter((source) => source.error)
        .map((source) => (
          <div
            role="alert"
            key={source.binding.id}
            className="my-2 flex flex-wrap items-center gap-2 text-xs text-danger"
          >
            <span>
              {source.binding.repository} ·{" "}
              {t(`tasks.errors.${source.error?.kind}`, {
                defaultValue: t("common.error"),
              })}{" "}
              · {source.error?.message}
            </span>
            <button
              type="button"
              className="app-button-ghost"
              disabled={source.loading}
              onClick={() => void load(source.binding, source.nextPage)}
            >
              {t("common.retry")}
            </button>
          </div>
        ))}
      {sources.some((source) => source.limited) && (
        <p className="text-xs text-muted">{t("tasks.limited")}</p>
      )}
    </>
  );
}
