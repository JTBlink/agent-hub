import { useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { useWorkspaceSelection } from "../../hooks/useWorkspaceSelection";
import { worktreeDirectoryName } from "../../lib/worktreeApi";
import { compactHomePath } from "../../utils";
import { ThemedSelect } from "../ThemedSelect";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";

/** Select a checkout within the current project from the window title bar. */
export function WorktreeCheckoutSwitcher() {
  const { t } = useTranslation();
  const { projects } = useApp();
  const selection = useWorkspaceSelection(projects);
  const selectedProject = selection.project;
  const [creatingFor, setCreatingFor] = useState<string>();
  return (
    <>
      <ThemedSelect
        fitContent
        aria-label={t("worktree.selectWorktree")}
        title={
          selectedProject && selection.path
            ? `${selectedProject.name}\n${compactHomePath(selection.path)}`
            : t("sidebar.openProjectHint")
        }
        value={selection.value}
        disabled={!selectedProject || selection.loading}
        onChange={(event) => {
          if (event.target.value === "create-worktree")
            setCreatingFor(`${selectedProject?.id}:${selection.path}`);
          else selection.select(event.target.value);
        }}
        optionIcon={(value) =>
          value === "create-worktree" ? (
            <Plus size={14} aria-hidden="true" />
          ) : null
        }
        className="h-6 max-w-[240px] min-w-0 gap-1 rounded border-transparent bg-transparent px-1 py-0 text-xs text-muted hover:bg-surface-hover hover:text-secondary"
        renderValue={(value) => {
          const option = selection.worktreeOptions.find(
            (item) => item.value === value,
          );
          return option ? worktreeDirectoryName(option.worktreePath) : "";
        }}
      >
        {!selectedProject && <option value="">{t("app.name")}</option>}
        {selection.worktreeOptions.map((option) => {
          const tree = selection.worktrees.find(
            (item) => item.path === option.worktreePath,
          );
          return (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {worktreeDirectoryName(option.worktreePath)}
              {tree?.is_main ? ` · ${t("worktree.main")}` : ""}
              {tree?.locked ? ` · ${t("worktree.locked")}` : ""}
            </option>
          );
        })}
        {selectedProject && selection.current?.head && (
          <option
            value="create-worktree"
            disabled={!selection.current.available}
          >
            {t("worktree.createMenu")}
          </option>
        )}
      </ThemedSelect>
      {selectedProject &&
        selection.path &&
        creatingFor === `${selectedProject.id}:${selection.path}` &&
        createPortal(
          <CreateWorktreeDialog
            key={creatingFor}
            projectId={selectedProject.id}
            sourcePath={selection.path}
            projectPath={selectedProject.path}
            onClose={() => setCreatingFor(undefined)}
            onCreated={(worktree) => {
              setCreatingFor(undefined);
              selection.openWorktree(selectedProject.id, worktree.path);
            }}
          />,
          document.body,
        )}
    </>
  );
}
