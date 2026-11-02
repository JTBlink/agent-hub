import { useRef, useState, type ReactNode } from "react";
import {
  Copy,
  FilePlus2,
  FolderPlus,
  FolderOpen,
  Pencil,
  Trash2,
  FileCode2,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { CardActionMenu, type CardAction } from "../CardActionMenu";
import { ConfirmDialog } from "../ConfirmDialog";
import { GitBrowserDialog } from "../GitBrowserDialog";
import {
  modifyWorktreeEntry,
  revealWorktreeEntry,
  type WorktreeFileAction,
} from "../../lib/worktreeApi";
import { hasPendingWorktreeDocument } from "../../hooks/useWorktreeDocument";
import { getErrorMessage } from "../../lib/error";

export interface WorktreeEntryChange {
  kind: WorktreeFileAction["kind"];
  path: string;
  nextPath: string;
}

export function WorktreeEntryMenu({
  projectId,
  worktreePath,
  path,
  directory,
  symlink = false,
  onSelect,
  onChanged,
  onRefresh,
  onCreated,
  children,
}: {
  projectId: string;
  worktreePath: string;
  path: string;
  directory: boolean;
  symlink?: boolean;
  onSelect: (path: string) => void;
  onChanged: (change: WorktreeEntryChange) => void;
  onRefresh: () => void;
  onCreated?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const target = useRef<HTMLDivElement>(null);
  const [operation, setOperation] = useState<WorktreeFileAction["kind"]>();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const folder = directory ? path : path.split("/").slice(0, -1).join("/");
  const begin = (kind: WorktreeFileAction["kind"]) => {
    setName(kind === "rename" ? (path.split("/").at(-1) ?? "") : "");
    setError("");
    setOperation(kind);
  };
  const report = async (action: () => Promise<unknown>, copied = false) => {
    try {
      await action();
      if (copied) toast.success(t("fileTree.copied"));
    } catch (cause) {
      toast.error(getErrorMessage(cause, t("common.error")));
    }
  };
  const submit = async (): Promise<void | false> => {
    if (!operation || pending.current) return false;
    const mutationPath =
      operation === "new_file" || operation === "new_directory" ? folder : path;
    if (
      (operation === "rename" || operation === "delete") &&
      hasPendingWorktreeDocument(projectId, worktreePath, path)
    ) {
      setError(t("fileTree.saveFirst"));
      return false;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const action: WorktreeFileAction =
        operation === "delete"
          ? { kind: operation }
          : { kind: operation, name };
      const nextPath = await modifyWorktreeEntry(
        projectId,
        worktreePath,
        mutationPath,
        action,
      );
      onChanged({ kind: operation, path: mutationPath, nextPath });
      if (operation === "new_file") onSelect(nextPath);
      if (operation === "new_file" || operation === "new_directory")
        onCreated?.();
      onRefresh();
      toast.success(t("fileTree.completed"));
      setOperation(undefined);
      return;
    } catch (cause) {
      setError(getErrorMessage(cause, t("common.error")));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const actions: CardAction[] = [
    ...(!directory
      ? [
          {
            key: "open",
            label: t("fileTree.open"),
            icon: <FileCode2 size={14} />,
            disabled: symlink,
            onSelect: () => onSelect(path),
          },
        ]
      : []),
    {
      key: "new_file",
      label: t("fileTree.newFile"),
      icon: <FilePlus2 size={14} />,
      disabled: symlink,
      onSelect: () => begin("new_file"),
    },
    {
      key: "new_directory",
      label: t("fileTree.newDirectory"),
      icon: <FolderPlus size={14} />,
      disabled: symlink,
      onSelect: () => begin("new_directory"),
    },
    {
      key: "reveal",
      separatorBefore: true,
      label: t("fileTree.reveal"),
      icon: <FolderOpen size={14} />,
      disabled: symlink,
      onSelect: () =>
        void report(() => revealWorktreeEntry(projectId, worktreePath, path)),
    },
    {
      key: "copy_path",
      separatorBefore: true,
      label: t("fileTree.copyPath"),
      icon: <Copy size={14} />,
      onSelect: () =>
        void report(
          () =>
            writeText(
              path
                ? `${worktreePath.replace(/[\\/]+$/, "")}/${path}`
                : worktreePath,
            ),
          true,
        ),
    },
    {
      key: "copy_relative",
      label: t("fileTree.copyRelativePath"),
      icon: <Copy size={14} />,
      onSelect: () => void report(() => writeText(path || "."), true),
    },
    {
      key: "refresh",
      label: t("worktree.refreshFiles"),
      icon: <RefreshCw size={14} />,
      onSelect: onRefresh,
    },
    ...(path
      ? [
          {
            key: "rename",
            separatorBefore: true,
            label: t("fileTree.rename"),
            icon: <Pencil size={14} />,
            disabled: symlink,
            onSelect: () => begin("rename"),
          },
          {
            key: "delete",
            label: t("common.delete"),
            icon: <Trash2 size={14} />,
            danger: true,
            disabled: symlink,
            onSelect: () => begin("delete"),
          },
        ]
      : []),
  ];
  const title = t(
    operation === "rename"
      ? "fileTree.rename"
      : operation === "new_directory"
        ? "fileTree.newDirectory"
        : "fileTree.newFile",
  );
  return (
    <>
      <div ref={target}>
        {children}
        <CardActionMenu
          contextTarget={target}
          contextOnly
          actions={actions}
          label={t("fileTree.actions")}
          disabled={busy}
        />
      </div>
      {operation === "delete" ? (
        <ConfirmDialog
          open
          title={t("fileTree.deleteTitle")}
          message={t("fileTree.deleteMessage", { path })}
          onClose={() => setOperation(undefined)}
          onConfirm={submit}
        >
          {error && (
            <p role="alert" className="break-words text-sm text-danger">
              {error}
            </p>
          )}
        </ConfirmDialog>
      ) : (
        operation && (
          <GitBrowserDialog
            title={title}
            busy={busy}
            onClose={() => setOperation(undefined)}
          >
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <p className="break-all text-xs text-muted">
                {operation === "rename" ? path : folder || "."}
              </p>
              <label className="block space-y-1 text-sm text-secondary">
                <span>{t("fileTree.name")}</span>
                <input
                  data-initial-focus
                  required
                  value={name}
                  disabled={busy}
                  className="app-input w-full"
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className="break-words text-sm text-danger">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setOperation(undefined)}
                  className="app-button-secondary px-3 py-1.5"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="app-button-primary px-3 py-1.5"
                >
                  {busy ? t("common.loading") : t("common.confirm")}
                </button>
              </div>
            </form>
          </GitBrowserDialog>
        )
      )}
    </>
  );
}
