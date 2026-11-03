import { useRef, useState, type ReactNode } from "react";
import { Copy, FolderOpen, GitBranch, Trash2 } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { revealWorktreeEntry } from "../../../lib/worktreeApi";
import type { HerdrWorkspace } from "../lib/herdrControlApi";
import { useTranslation } from "react-i18next";
import { deleteHerdrWorktree } from "../lib/herdrControlApi";
import { getErrorMessage } from "../../../lib/error";
import { CardActionMenu } from "../../../components/CardActionMenu";
import { ConfirmDialog } from "../../../components/ConfirmDialog";

/** Checkout context actions reuse row navigation and require confirmation for deletion. */
export function HerdrWorktreeMenu({
  children,
  disabled,
  onOpen,
  target = "worktree",
  deletion,
  workspace,
  projectId,
  relativePath,
  unavailable = false,
}: {
  children: ReactNode;
  disabled: boolean;
  onOpen: () => void;
  target?: "project" | "worktree";
  workspace: Pick<HerdrWorkspace, "label" | "directory" | "branch">;
  projectId?: string;
  relativePath?: string | null;
  unavailable?: boolean;
  deletion?: {
    session: string;
    projectId: string;
    path: string;
    workspaceId?: string;
    disabled: boolean;
    onDeleted: () => void;
  };
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const row = useRef<HTMLDivElement>(null);
  const report = async (action: () => Promise<unknown>, copied = false) => {
    try {
      await action();
      if (copied) toast.success(t("herdr.copied"));
    } catch (cause) {
      toast.error(getErrorMessage(cause, t("common.error")));
    }
  };
  const copy = (text: string) => void report(() => writeText(text), true);
  const directory = workspace.directory;

  return (
    <>
      <div
        ref={row}
        role={unavailable ? "group" : undefined}
        aria-label={unavailable ? workspace.label : undefined}
        tabIndex={unavailable ? 0 : undefined}
      >
        {children}
        <CardActionMenu
          contextOnly
          contextTarget={row}
          disabled={disabled}
          label={t(
            target === "project"
              ? "herdr.projectActions"
              : "herdr.worktreeActions",
          )}
          actions={[
            {
              key: "open",
              label: t(
                target === "project"
                  ? "herdr.openProject"
                  : "herdr.openWorktree",
              ),
              icon: <FolderOpen size={14} />,
              disabled: unavailable,
              onSelect: onOpen,
            },
            {
              key: "reveal",
              label: t("fileTree.reveal"),
              icon: <FolderOpen size={14} />,
              disabled: unavailable || !projectId || !directory,
              onSelect: () => {
                if (projectId && directory)
                  void report(() =>
                    revealWorktreeEntry(projectId, directory, ""),
                  );
              },
            },
            {
              key: "copy_path",
              separatorBefore: true,
              label: t("common.copyPath"),
              icon: <Copy size={14} />,
              disabled: !directory,
              onSelect: () => {
                if (directory) copy(directory);
              },
            },
            {
              key: "copy_relative_path",
              label: t("fileTree.copyRelativePath"),
              icon: <Copy size={14} />,
              disabled: !relativePath,
              onSelect: () => {
                if (relativePath) copy(relativePath);
              },
            },
            {
              key: "copy_name",
              label: t("herdr.copyName"),
              icon: <Copy size={14} />,
              onSelect: () => copy(workspace.label),
            },
            ...(workspace.branch
              ? [
                  {
                    key: "copy_branch",
                    label: t("git.copyBranchName"),
                    icon: <GitBranch size={14} />,
                    onSelect: () => {
                      if (workspace.branch) copy(workspace.branch);
                    },
                  },
                ]
              : []),
            ...(deletion
              ? [
                  {
                    key: "delete",
                    label: t("herdr.deleteWorktree"),
                    icon: <Trash2 size={14} />,
                    separatorBefore: true,
                    danger: true,
                    disabled: deletion.disabled || unavailable,
                    onSelect: () => {
                      setError("");
                      setConfirming(true);
                    },
                  },
                ]
              : []),
          ]}
        />
      </div>
      {deletion && (
        <ConfirmDialog
          open={confirming}
          title={t("herdr.deleteWorktree")}
          message={t("herdr.deleteWorktreeHelp", { path: deletion.path })}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            try {
              await deleteHerdrWorktree(
                deletion.session,
                deletion.projectId,
                deletion.path,
                deletion.workspaceId,
              );
              deletion.onDeleted();
            } catch (cause) {
              setError(getErrorMessage(cause, t("common.error")));
              return false;
            }
          }}
        >
          {error && (
            <p role="alert" className="text-xs text-danger whitespace-pre-wrap">
              {error}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
