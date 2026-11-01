import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  GitBranch,
  History,
  ListTree,
  RefreshCw,
  List,
  Plus,
  Minus,
} from "lucide-react";
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
  onRemote,
  onBranch,
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
  onRemote: (action: "fetch" | "pull" | "push") => void;
  onBranch: () => void;
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
      icon: ArrowDown,
      onClick: () => onRemote("pull"),
      disabled: disabled || !canSync,
    },
    {
      key: "push",
      icon: ArrowUp,
      onClick: () => onRemote("push"),
      disabled: disabled || !canSync,
    },
    { key: "branches", icon: GitBranch, onClick: onBranch, disabled },
    { key: "commit", icon: Check, disabled: !canCommit },
    { key: "history", icon: History, onClick: onHistory, pressed: history },
    {
      key: "refresh",
      icon: RefreshCw,
      onClick: onRefresh,
      disabled,
      spin: loading,
    },
    {
      key: "layout",
      icon: tree ? ListTree : List,
      onClick: onTree,
      pressed: tree,
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
        className="ml-auto flex items-center"
      >
        {actions.map(
          ({ key, icon: Icon, onClick, disabled: inactive, pressed, spin }) => (
            <button
              key={key}
              type={key === "commit" ? "submit" : "button"}
              aria-label={t(`git.actions.${key}`)}
              title={t(`git.actions.${key}`)}
              aria-pressed={pressed}
              disabled={inactive}
              onClick={onClick}
              className={cn(
                "app-button-ghost h-6 w-6 shrink-0 p-0",
                pressed && "bg-surface-active text-accent-light",
              )}
            >
              <Icon size={14} className={cn(spin && "animate-spin")} />
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
