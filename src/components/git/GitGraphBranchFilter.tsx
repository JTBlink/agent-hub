import { GitBranch, Cloud } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "../ThemedSelect";
import type { GitGraphCommit } from "../../lib/gitApi";

import { graphBranchOptions } from "../../lib/gitGraphBranches";

export function GitGraphBranchFilter({
  commits,
  value,
  onChange,
}: {
  commits: GitGraphCommit[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const options = graphBranchOptions(commits);
  return (
    <label
      className="flex min-w-0 items-center gap-1.5"
      title={t("git.graph.loadedBranchesHint")}
    >
      {t("git.graph.branches")}
      <ThemedSelect
        aria-label={t("git.graph.branches")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-80"
        fitContent
        singleLineOptions
        optionIcon={(key) =>
          key && options.find((option) => option.value === key)?.remote ? (
            <Cloud size={13} className="shrink-0" />
          ) : (
            <GitBranch size={13} className="shrink-0" />
          )
        }
      >
        <option value="">{t("git.graph.allBranches")}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {`${t(option.remote ? "git.graph.remoteBranch" : "git.graph.localBranch")} · ${option.name}`}
          </option>
        ))}
      </ThemedSelect>
    </label>
  );
}
