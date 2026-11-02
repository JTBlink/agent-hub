import { useRef, useState, type ReactNode } from "react";
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
}: {
  children: ReactNode;
  disabled: boolean;
  onOpen: () => void;
  target?: "project" | "worktree";
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
  return (
    <>
      <div ref={row}>
        {children}
        <CardActionMenu
          contextOnly
          contextTarget={row}
          disabled={disabled}
          label={t("herdr.worktreeActions")}
          actions={[
            {
              key: "open",
              label: t(
                target === "project"
                  ? "herdr.openProject"
                  : "herdr.openWorktree",
              ),
              onSelect: onOpen,
            },
            ...(deletion
              ? [
                  {
                    key: "delete",
                    label: t("herdr.deleteWorktree"),
                    danger: true,
                    disabled: deletion.disabled,
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
