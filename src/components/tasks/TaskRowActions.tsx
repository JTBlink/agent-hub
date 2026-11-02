import { useState } from "react";
import { ArrowRight, ExternalLink, Eye } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { taskFailure, type RepositoryTask } from "../../lib/taskBrowserApi";
import { CardActionMenu } from "../CardActionMenu";
import { reviewActions, type ReviewAction } from "../../lib/taskReviewActions";

export function TaskRowActions({
  task,
  canStart,
  onPreview,
  onStart,
}: {
  task: RepositoryTask;
  canStart: boolean;
  onPreview: (trigger: HTMLElement) => void;
  onStart: (action?: ReviewAction) => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          className="app-button-secondary h-7 gap-1 px-2 text-xs"
          disabled={!canStart}
          title={t("tasks.launch.title")}
          onClick={() => onStart()}
        >
          {t("tasks.start")}
          <ArrowRight size={12} />
        </button>
        <button
          type="button"
          className="app-button-ghost h-7 w-7 p-0"
          aria-label={t("tasks.preview")}
          title={t("tasks.preview")}
          onClick={(event) => onPreview(event.currentTarget)}
        >
          <Eye size={14} />
        </button>
        <CardActionMenu
          label={t("tasks.moreActions")}
          triggerClassName="h-7 w-6"
          actions={[
            ...reviewActions(task).map((action) => ({
              key: action,
              label: t(`tasks.reviewActions.${action}`),
              disabled: !canStart,
              onSelect: () => onStart(action),
            })),
            {
              key: "browser",
              label: t("tasks.openInBrowser"),
              icon: <ExternalLink size={13} />,
              disabled: !/^https?:\/\//i.test(task.url),
              onSelect: () =>
                void openUrl(task.url).catch((error) =>
                  setError(taskFailure(error).message),
                ),
            },
          ]}
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
