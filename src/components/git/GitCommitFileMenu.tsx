import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CardActionMenu } from "../CardActionMenu";
import { useGitCopyActions } from "./useGitCopyActions";
import type { CommitTarget, CommitFileSelection } from "./GitCommitDetails";

export function GitCommitFileMenu({
  target,
  sha,
  path,
  deleted,
  onSelect,
  children,
}: {
  target: CommitTarget;
  sha: string;
  path: string;
  deleted: boolean;
  onSelect: (selection: CommitFileSelection) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const copies = useGitCopyActions([
    ...(target.worktreePath
      ? [
          {
            key: "absolute",
            label: t("fileTree.copyPath"),
            text: `${target.worktreePath.replace(/[\\/]+$/, "")}/${path}`,
          },
        ]
      : []),
    { key: "relative", label: t("fileTree.copyRelativePath"), text: path },
  ]);
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
            label: t("git.viewDiff"),
            onSelect: () => onSelect({ sha, path }),
          },
          {
            key: "revision",
            label: t("git.viewRevision"),
            disabled: deleted,
            onSelect: () => onSelect({ sha, path, view: "revision" }),
          },
          {
            key: "working",
            label: t("git.compareWorking"),
            onSelect: () => onSelect({ sha, path, view: "working" }),
          },
          {
            key: "open",
            label: t("fileTree.open"),
            onSelect: () => onSelect({ sha, path, view: "file" }),
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
