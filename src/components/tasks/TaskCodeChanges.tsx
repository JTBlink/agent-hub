import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TaskDevelopment } from "../../lib/taskBrowserApi";
import { FileReaderDialog } from "../file-reader";

export function TaskCodeChanges({
  development,
}: {
  development?: TaskDevelopment;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>();
  const files = development?.files ?? [];
  const commits = development?.commits ?? [];
  const readable = files
    .filter((file) => file.patch !== null)
    .map((file) => ({ path: `${file.path}.diff`, content: file.patch ?? "" }));
  return (
    <>
      {files.length > 0 && (
        <section
          className="space-y-2 border-t border-border-subtle pt-3"
          aria-label={t("tasks.facts.files")}
        >
          <h3 className="text-xs font-semibold">
            {t("tasks.facts.files")} · {files.length}
          </h3>
          {files.map((file) => (
            <button
              type="button"
              key={file.path}
              disabled={file.patch === null}
              title={file.path}
              className="flex w-full items-center gap-2 text-left text-xs text-secondary hover:text-accent-light disabled:text-muted"
              onClick={() => setSelected(`${file.path}.diff`)}
            >
              <code className="min-w-0 flex-1 truncate">{file.path}</code>
              <span className="text-muted">
                {t(`git.states.${file.status}`, { defaultValue: file.status })}
              </span>
              {file.additions != null && <span>+{file.additions}</span>}
              {file.deletions != null && <span>−{file.deletions}</span>}
            </button>
          ))}
        </section>
      )}
      {commits.length > 0 && (
        <section
          className="space-y-2 border-t border-border-subtle pt-3"
          aria-label={t("tasks.facts.commits")}
        >
          <h3 className="text-xs font-semibold">
            {t("tasks.facts.commits")} · {commits.length}
          </h3>
          {commits.map((commit) => (
            <div key={commit.sha} className="space-y-1 text-xs">
              <p className="break-words">{commit.message}</p>
              <p className="text-xs text-muted">
                <code title={commit.sha}>{commit.sha.slice(0, 12)}</code> ·{" "}
                {commit.author}
                {commit.created_at
                  ? ` · ${new Date(commit.created_at).toLocaleString()}`
                  : ""}
              </p>
            </div>
          ))}
        </section>
      )}
      {selected && (
        <FileReaderDialog
          title={t("tasks.facts.files")}
          files={readable}
          initialPath={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </>
  );
}
