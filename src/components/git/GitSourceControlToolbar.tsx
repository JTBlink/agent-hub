import { Fragment, type ReactNode } from "react";
import { Download, GitGraph, Plus, Minus } from "lucide-react";
import "@vscode/codicons/dist/codicon.css";
import { useTranslation } from "react-i18next";
import { CardActionMenu } from "../CardActionMenu";
import { cn } from "../../utils";

export function GitSourceControlToolbar({
  disabled,
  canSync,
  canCommit,
  loading,
  tree,
  history,
  graph,
  onGraph,
  onRemote,
  branchControl,
  onRefresh,
  onTree,
  onHistory,
  onStageAll,
  onUnstageAll,
  canStage,
  canUnstage,
}: {
  disabled: boolean;
  canSync: boolean;
  canCommit: boolean;
  loading: boolean;
  tree: boolean;
  history: boolean;
  graph: boolean;
  onGraph: () => void;
  onRemote: (action: "fetch" | "pull" | "push") => void;
  branchControl: ReactNode;
  onRefresh: () => void;
  onTree: () => void;
  onHistory: () => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  canStage: boolean;
  canUnstage: boolean;
}) {
  const { t } = useTranslation();
  const actions = [
    {
      key: "pull",
      icon: "repo-pull",
      onClick: () => onRemote("pull"),
      disabled: disabled || !canSync,
    },
    {
      key: "push",
      icon: "repo-push",
      onClick: () => onRemote("push"),
      disabled: disabled || !canSync,
    },
    { key: "branches", icon: "source-control", disabled },
    { key: "commit", icon: "check", disabled: !canCommit },
    { key: "history", icon: "history", onClick: onHistory, pressed: history },
    {
      key: "layout",
      icon: tree ? "list-tree" : "list-flat",
      onClick: onTree,
      pressed: tree,
    },
    {
      key: "graph",
      icon: GitGraph,
      onClick: onGraph,
      pressed: graph,
      disabled,
    },
    {
      key: "refresh",
      icon: "refresh",
      onClick: onRefresh,
      disabled,
      spin: loading,
    },
  ];
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1">
      <span className="mr-auto text-xs font-semibold text-secondary">
        {t("git.changes")}
      </span>
      <div
        role="group"
        aria-label={t("git.actions.label")}
        className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end"
      >
        {actions.map(
          ({ key, icon: Icon, onClick, disabled: inactive, pressed, spin }) =>
            key === "branches" ? (
              <Fragment key={key}>{branchControl}</Fragment>
            ) : (
              <button
                key={key}
                type={key === "commit" ? "submit" : "button"}
                aria-label={t(
                  key === "graph" ? "git.graph.open" : `git.actions.${key}`,
                )}
                title={t(
                  key === "graph" ? "git.graph.open" : `git.actions.${key}`,
                )}
                aria-pressed={pressed}
                disabled={inactive}
                onClick={onClick}
                className={cn(
                  "app-button-ghost h-6 w-6 shrink-0 p-0",
                  pressed && "bg-surface-active text-accent-light",
                )}
              >
                {typeof Icon === "string" ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      `codicon codicon-${Icon}`,
                      spin && "animate-spin",
                    )}
                    style={{ fontSize: 14, lineHeight: 1 }}
                  />
                ) : (
                  <Icon size={14} aria-hidden="true" />
                )}
              </button>
            ),
        )}
        <CardActionMenu
          label={t("git.actions.more")}
          triggerClassName="h-6 w-6"
          actions={[
            {
              key: "fetch",
              label: t("git.actions.fetch"),
              icon: <Download size={14} />,
              disabled,
              onSelect: () => onRemote("fetch"),
            },
            {
              key: "stage",
              label: t("git.stageAll"),
              icon: <Plus size={14} />,
              disabled: disabled || !canStage,
              onSelect: onStageAll,
            },
            {
              key: "unstage",
              label: t("git.unstageAll"),
              icon: <Minus size={14} />,
              disabled: disabled || !canUnstage,
              onSelect: onUnstageAll,
            },
          ]}
        />
      </div>
    </div>
  );
}
