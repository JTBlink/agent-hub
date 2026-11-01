/** Keep the branch readable by letting the project name yield space first. */
export function WorkspaceSelectionValue({
  project,
  branch,
  truncate = true,
}: {
  project: string;
  branch?: string;
  /** The title bar gives the complete label its natural width. */
  truncate?: boolean;
}) {
  return (
    <span
      className={
        truncate
          ? "flex min-w-0 items-center gap-1"
          : "inline-flex items-center gap-1 whitespace-nowrap"
      }
    >
      <span
        className={
          truncate
            ? branch
              ? "max-w-[40%] shrink truncate"
              : "truncate"
            : "shrink-0"
        }
      >
        {project}
      </span>
      {branch && (
        <>
          <span className="shrink-0 text-faint">{" · "}</span>
          <span className={truncate ? "min-w-0 flex-1 truncate" : "shrink-0"}>
            {branch}
          </span>
        </>
      )}
    </span>
  );
}
