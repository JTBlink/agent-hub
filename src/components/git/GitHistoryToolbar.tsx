import {
  Archive,
  Cloud,
  GitBranch,
  GitCommitHorizontal,
  Tags,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GitReferenceKind } from "../../lib/gitApi";
import { cn } from "../../utils";

export type GitBrowseView = "commits" | "contributors" | GitReferenceKind;
const views = [
  { value: "commits", icon: GitCommitHorizontal },
  { value: "branches", icon: GitBranch },
  { value: "remotes", icon: Cloud },
  { value: "stashes", icon: Archive },
  { value: "tags", icon: Tags },
  { value: "contributors", icon: Users },
] as const;

export function GitHistoryToolbar({
  view,
  enabled,
  onChange,
}: {
  view: GitBrowseView;
  enabled: boolean;
  onChange: (view: GitBrowseView) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("git.repositoryNavigation")}
      className="flex shrink-0 items-center"
    >
      {views.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={t(`git.browse.${value}`)}
          title={t(`git.browse.${value}`)}
          aria-pressed={view === value}
          disabled={!enabled && value !== "commits"}
          onClick={() => onChange(value)}
          className={cn(
            "app-button-ghost h-6 w-6 p-0",
            view === value && "bg-surface-active text-accent-light",
          )}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
