import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { GitFile } from "../../lib/gitApi";
import { revealWorktreeEntry } from "../../lib/worktreeApi";
import { getErrorMessage } from "../../lib/error";
import { CardActionMenu } from "../CardActionMenu";
import { useGitCopyActions } from "./useGitCopyActions";
import type { GitSelection } from "./GitChanges";
import type { CommitFileSelection } from "./GitCommitDetails";

/** Working changes reuse the same menu and mutation flows as the sidebar. */
export function GitChangeFileMenu({
  projectId,
  root,
  head,
  file,
  staged,
  busy,
  onSelect,
  onOpenFile,
  onOpenRevision,
  onStage,
  onDiscard,
  children,
}: {
  projectId: string;
  root?: string;
  head?: string | null;
  file: GitFile;
  staged: boolean;
  busy: boolean;
  onSelect: (selection: GitSelection) => void;
  onOpenFile: (selection: GitSelection) => void;
  onOpenRevision: (selection: CommitFileSelection) => void;
  onStage: (paths: string[], staged: boolean) => void;
  onDiscard: (paths: string[]) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const selection = { path: file.path, staged };
  const deleted = file.status === "deleted";
  const copies = useGitCopyActions([
    ...(root
      ? [
          {
            key: "absolute",
            label: t("fileTree.copyPath"),
            text: `${root.replace(/[\\/]+$/, "")}/${file.path}`,
          },
        ]
      : []),
    { key: "relative", label: t("fileTree.copyRelativePath"), text: file.path },
  ]);
  const reveal = async () => {
    if (!root) return;
    try {
      await revealWorktreeEntry(projectId, root, file.path);
    } catch (cause) {
      toast.error(getErrorMessage(cause, t("common.error")));
    }
  };
  return (
    <div ref={ref}>
      {children}
      <CardActionMenu
        contextTarget={ref}
        contextOnly
        label={t("fileTree.actions")}
        actions={[
          {
            key: "diff",
            label: t("git.openChanges"),
            onSelect: () => onSelect(selection),
          },
          {
            key: "file",
            label: t("fileTree.open"),
            disabled: deleted || !root,
            onSelect: () => onOpenFile(selection),
          },
          {
            key: "head",
            label: t("git.openHead"),
            disabled: !head || ["added", "untracked"].includes(file.status),
            onSelect: () => {
              if (head)
                onOpenRevision({
                  sha: head,
                  path: file.old_path ?? file.path,
                  view: "revision",
                });
            },
          },
          {
            key: "stage",
            separatorBefore: true,
            label: t(staged ? "git.unstageFile" : "git.stageFile"),
            disabled: busy,
            onSelect: () => onStage([file.path], !staged),
          },
          ...(!staged
            ? [
                {
                  key: "discard",
                  label: t("git.discardChanges"),
                  danger: true,
                  disabled: busy,
                  onSelect: () => onDiscard([file.path]),
                },
              ]
            : []),
          {
            key: "reveal",
            separatorBefore: true,
            label: t("fileTree.reveal"),
            disabled: deleted || !root,
            onSelect: () => void reveal(),
          },
          ...copies.map((action, index) => ({
            ...action,
            separatorBefore: index === 0,
          })),
        ]}
      />
    </div>
  );
}
