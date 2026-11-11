import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspaceFiles } from "../../hooks/useWorkspaceFiles";
import { useWorktreePreviews } from "../../hooks/worktreePreviewsContext";
import { FileTypeIcon } from "../FileTypeIcon";
import { TabCloseButton } from "../TabCloseButton";
import { WorktreeFileCloseButton } from "./WorktreeFileCloseButton";
import { WorktreeEditorMenu } from "./WorktreeEditorMenu";
import { cn } from "../../utils";

/** Mirror the checkout's existing source and preview tabs, including close guards. */
export function WorktreeOpenEditors({
  projectId,
  worktreePath,
}: {
  projectId: string;
  worktreePath: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const { files, setFiles } = useWorkspaceFiles();
  const previews = useWorktreePreviews();
  const scope = JSON.stringify([projectId, worktreePath]);
  const file = files[scope];
  const tabs = previews?.tabs.filter((tab) => tab.scope === scope) ?? [];
  if (!file && !tabs.length) return null;
  const entries = [
    ...(file
      ? [
          {
            id: "source",
            path: file.path,
            preview: false,
            active:
              file.shown &&
              !tabs.some((tab) => tab.document.id === previews?.selected),
            select: () => {
              previews?.select(null);
              setFiles((previous) => ({
                ...previous,
                [scope]: { ...file, shown: true },
              }));
            },
            close: (
              <WorktreeFileCloseButton
                projectId={projectId}
                worktreePath={worktreePath}
                path={file.path}
                onClose={() =>
                  setFiles((previous) => {
                    const next = { ...previous };
                    delete next[scope];
                    return next;
                  })
                }
              />
            ),
          },
        ]
      : []),
    ...tabs.map((tab) => ({
      id: tab.document.id,
      path: tab.path,
      preview: true,
      active: previews?.selected === tab.document.id,
      select: () => previews?.select(tab.document.id),
      close: (
        <TabCloseButton
          aria-label={t("preview.closeTab", { title: tab.document.title })}
          onClick={() => previews?.close(tab.document.id)}
        />
      ),
    })),
  ];
  return (
    <section
      className="shrink-0 border-b border-border-subtle"
      aria-label={t("worktree.openEditors")}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex h-7 w-full items-center gap-1 px-2 text-left text-xs font-semibold text-primary hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <ChevronRight
          size={14}
          className={cn("shrink-0", expanded && "rotate-90")}
        />
        {t("worktree.openEditors")}
      </button>
      {expanded && (
        <ul className="max-h-40 overflow-auto pb-1">
          {entries.map((entry) => (
            <li key={entry.id}>
              <WorktreeEditorMenu
                projectId={projectId}
                worktreePath={worktreePath}
                path={entry.path}
                previewId={entry.preview ? entry.id : undefined}
                className={cn(
                  "group flex h-[22px] items-center pr-1 text-[13px]",
                  entry.active
                    ? "bg-surface-active text-primary"
                    : "text-primary hover:bg-surface-hover",
                )}
              >
                <button
                  type="button"
                  title={entry.path}
                  aria-pressed={entry.active}
                  onClick={entry.select}
                  className="flex h-full min-w-0 flex-1 items-center gap-1.5 pl-7 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  <FileTypeIcon path={entry.path} />
                  <span
                    className={cn("shrink truncate", entry.preview && "italic")}
                  >
                    {entry.path.split("/").at(-1)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                    {entry.path.split("/").slice(0, -1).join("/")}
                  </span>
                </button>
                {entry.close}
              </WorktreeEditorMenu>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
