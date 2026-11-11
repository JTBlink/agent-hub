import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  Copy,
  CopyX,
  FolderOpen,
  ListX,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CardActionMenu, type CardAction } from "../CardActionMenu";
import { ConfirmDialog } from "../ConfirmDialog";
import { SaveWorktreeChangesDialog } from "./SaveWorktreeChangesDialog";
import { useWorkspaceFiles } from "../../hooks/useWorkspaceFiles";
import { useWorktreePreviews } from "../../hooks/worktreePreviewsContext";
import {
  reloadWorktreeDocument,
  saveWorktreeDocument,
  useWorktreeDocumentSnapshot,
} from "../../hooks/useWorktreeDocument";
import { revealWorktreeEntry } from "../../lib/worktreeApi";
import { getErrorMessage } from "../../lib/error";

type CloseTarget = { source: boolean; previews: string[] };

/** Shared by the open-editors list and its corresponding workspace tabs. */
export function WorktreeEditorMenu({
  projectId,
  worktreePath,
  path,
  previewId,
  className,
  children,
}: {
  projectId: string;
  worktreePath: string;
  path: string;
  previewId?: string;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const target = useRef<HTMLDivElement>(null);
  const { files, setFiles } = useWorkspaceFiles();
  const previews = useWorktreePreviews();
  const scope = JSON.stringify([projectId, worktreePath]);
  const source = files[scope];
  const sourceDocument = useWorktreeDocumentSnapshot(
    projectId,
    worktreePath,
    source?.path ?? "",
  );
  const [closing, setClosing] = useState<CloseTarget>();
  const [reverting, setReverting] = useState(false);
  const tabs = previews?.tabs.filter((tab) => tab.scope === scope) ?? [];
  const sourceKey = JSON.stringify([projectId, worktreePath, source?.path]);
  const editable = !previewId && source?.path === path;
  const busy = sourceDocument.loading || sourceDocument.saving;
  const report = async (action: () => Promise<unknown>, copied = false) => {
    try {
      await action();
      if (copied) toast.success(t("fileTree.copied"));
    } catch (cause) {
      toast.error(getErrorMessage(cause, t("common.error")));
    }
  };
  const finishClose = (selection: CloseTarget) => {
    // Preview close guards own their confirmation and keep a cancelled tab open.
    for (const id of selection.previews) {
      if (previews?.close(id) === false) {
        setClosing(undefined);
        return;
      }
    }
    if (selection.source && source) {
      setFiles((previous) => {
        if (previous[scope]?.path !== source.path) return previous;
        const next = { ...previous };
        delete next[scope];
        return next;
      });
    }
    setClosing(undefined);
  };
  const requestClose = (selection: CloseTarget) => {
    if (selection.source && sourceDocument.saving) return;
    if (selection.source && sourceDocument.dirty) setClosing(selection);
    else finishClose(selection);
  };
  const actions: CardAction[] = [
    {
      key: "reveal",
      label: t("fileTree.reveal"),
      icon: <FolderOpen size={14} />,
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
          () => writeText(`${worktreePath.replace(/[\\/]+$/, "")}/${path}`),
          true,
        ),
    },
    {
      key: "copy_relative",
      label: t("fileTree.copyRelativePath"),
      icon: <Copy size={14} />,
      onSelect: () => void report(() => writeText(path), true),
    },
    ...(editable
      ? [
          {
            key: "save",
            separatorBefore: true,
            label: t("common.save"),
            icon: <Save size={14} />,
            shortcut: /Mac|iPhone|iPad/.test(navigator.platform)
              ? "⌘ S"
              : "Ctrl+S",
            disabled: busy || !sourceDocument.dirty,
            onSelect: () =>
              void saveWorktreeDocument(sourceKey).then((saved) => {
                if (!saved) toast.error(t("worktree.saveBeforeCloseFailed"));
              }),
          },
          {
            key: "revert",
            label: t("worktree.revertFile"),
            icon: <RotateCcw size={14} />,
            disabled: busy || !sourceDocument.dirty,
            onSelect: () => setReverting(true),
          },
        ]
      : []),
    {
      key: "close",
      separatorBefore: true,
      label: t("worktree.closeEditor"),
      icon: <X size={14} />,
      disabled: !previewId && sourceDocument.saving,
      onSelect: () =>
        requestClose({
          source: !previewId,
          previews: previewId ? [previewId] : [],
        }),
    },
    {
      key: "close_others",
      label: t("worktree.closeOtherEditors"),
      icon: <CopyX size={14} />,
      disabled:
        (source ? 1 : 0) + tabs.length <= 1 ||
        (!!previewId && sourceDocument.saving),
      onSelect: () =>
        requestClose({
          source: !!previewId && !!source,
          previews: tabs
            .filter((tab) => tab.document.id !== previewId)
            .map((tab) => tab.document.id),
        }),
    },
    {
      key: "close_all",
      label: t("worktree.closeAllEditors"),
      icon: <ListX size={14} />,
      disabled: !!source && sourceDocument.saving,
      onSelect: () =>
        requestClose({
          source: !!source,
          previews: tabs.map((tab) => tab.document.id),
        }),
    },
  ];
  return (
    <>
      <div ref={target} className={className}>
        {children}
        <CardActionMenu
          contextTarget={target}
          contextOnly
          actions={actions}
          label={t("worktree.editorActions")}
        />
      </div>
      {closing && source && (
        <SaveWorktreeChangesDialog
          documents={[{ key: sourceKey, path: source.path }]}
          onCancel={() => setClosing(undefined)}
          onProceed={() => finishClose(closing)}
        />
      )}
      {reverting && (
        <ConfirmDialog
          open
          title={t("worktree.revertFile")}
          message={t("worktree.revertFileMessage", { path })}
          confirmLabel={t("worktree.revertFile")}
          onClose={() => setReverting(false)}
          onConfirm={async () => {
            const restored = await reloadWorktreeDocument(
              projectId,
              worktreePath,
              path,
            );
            if (!restored) toast.error(t("worktree.revertFileFailed"));
            if (restored) setReverting(false);
            return restored ? undefined : false;
          }}
        />
      )}
    </>
  );
}
