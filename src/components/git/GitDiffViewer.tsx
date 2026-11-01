import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { parseGitDiff, type GitDiffLine } from "../../lib/gitDiff";
import { cn } from "../../utils";

function DiffCell({
  line,
  side,
}: {
  line?: GitDiffLine;
  side: "left" | "right";
}) {
  return (
    <td
      className={cn(
        "git-diff-cell",
        !line && "git-diff-empty",
        line?.changed &&
          (side === "left" ? "git-diff-removed" : "git-diff-added"),
      )}
    >
      <span className="git-diff-number" aria-hidden="true">
        {line?.number}
      </span>
      <span className="git-diff-marker" aria-hidden="true">
        {line?.changed ? (side === "left" ? "−" : "+") : ""}
      </span>
      <span className="whitespace-pre-wrap break-all">
        {line?.content || " "}
      </span>
    </td>
  );
}

export function GitDiffViewer({
  patch,
  staged,
}: {
  patch: string;
  staged: boolean;
}) {
  const { t } = useTranslation();
  const { rows, truncated } = useMemo(() => parseGitDiff(patch), [patch]);
  if (!rows.length)
    return (
      <p role="status" className="p-6 text-xs text-muted">
        {t("git.noDiff")}
      </p>
    );
  return (
    <div
      className="min-h-0 flex-1 overflow-auto"
      tabIndex={0}
      aria-label={t("git.diff")}
    >
      <table className="git-diff-table">
        <thead>
          <tr>
            <th scope="col">
              {t(staged ? "git.headVersion" : "git.indexVersion")}
            </th>
            <th scope="col">
              {t(staged ? "git.indexVersion" : "git.workingVersion")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) =>
            row.type === "hunk" ? (
              <tr key={index}>
                <td colSpan={2} className="git-diff-hunk">
                  {row.text}
                </td>
              </tr>
            ) : (
              <tr key={index}>
                <DiffCell line={row.left} side="left" />
                <DiffCell line={row.right} side="right" />
              </tr>
            ),
          )}
        </tbody>
      </table>
      {truncated && (
        <p role="status" className="p-3 text-xs text-muted">
          {t("git.diffTruncated")}
        </p>
      )}
    </div>
  );
}
