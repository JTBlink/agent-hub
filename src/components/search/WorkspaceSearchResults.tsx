import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  WorktreeSearchFile,
  WorktreeSearchMatch,
} from "../../lib/worktreeSearchApi";
import { SearchIcon } from "./WorkspaceSearchFields";

export function WorkspaceSearchResults({
  files,
  onSelect,
  replaceOpen,
  onReplace,
  canReplace,
  collapseVersion,
}: {
  files: WorktreeSearchFile[];
  onSelect: (file: WorktreeSearchFile, match: WorktreeSearchMatch) => void;
  replaceOpen: boolean;
  onReplace: (file: WorktreeSearchFile) => void;
  canReplace: boolean;
  collapseVersion: number;
}) {
  return (
    <ul className="pb-2">
      {files.map((file) => (
        <FileResults
          key={`${file.path}:${collapseVersion}`}
          file={file}
          onSelect={onSelect}
          replaceOpen={replaceOpen}
          onReplace={onReplace}
          canReplace={canReplace}
          initiallyOpen={collapseVersion % 2 === 0}
        />
      ))}
    </ul>
  );
}
function FileResults({
  file,
  onSelect,
  replaceOpen,
  onReplace,
  canReplace,
  initiallyOpen,
}: {
  file: WorktreeSearchFile;
  onSelect: (file: WorktreeSearchFile, match: WorktreeSearchMatch) => void;
  replaceOpen: boolean;
  onReplace: (file: WorktreeSearchFile) => void;
  canReplace: boolean;
  initiallyOpen: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(initiallyOpen);
  return (
    <li>
      <div className="group flex min-w-0 items-center hover:bg-surface-hover">
        <button
          type="button"
          aria-expanded={expanded}
          title={file.path}
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-1 py-1 pl-2 text-left text-xs text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <SearchIcon name={expanded ? "chevron-down" : "chevron-right"} />
          <SearchIcon name="file-code" />
          <span className="min-w-0 flex-1 truncate">
            {file.path.split("/").pop()}
            <span className="ml-1 text-faint">
              {file.path.includes("/")
                ? file.path.slice(0, file.path.lastIndexOf("/"))
                : ""}
            </span>
          </span>
          <span className="ml-auto rounded-full bg-surface-active px-1.5 font-mono tabular-nums">
            {file.matches.length}
          </span>
        </button>
        {replaceOpen && (
          <button
            type="button"
            disabled={!canReplace}
            aria-label={t("workspaceSearch.replaceFile", { path: file.path })}
            title={t("workspaceSearch.replaceFile", { path: file.path })}
            onClick={() => onReplace(file)}
            className="app-button-ghost mx-1 h-6 w-6 shrink-0 p-0"
          >
            <SearchIcon name="replace-all" />
          </button>
        )}
      </div>
      {expanded && (
        <ul>
          {file.matches.map((match, index) => {
            const start = Math.max(0, match.column - match.preview_start);
            const end = Math.max(start, match.end_column - match.preview_start);
            return (
              <li key={index}>
                <button
                  type="button"
                  title={`${file.path}:${match.line}:${match.column}\n${match.preview}`}
                  aria-label={t("workspaceSearch.openMatch", {
                    path: file.path,
                    line: match.line,
                    column: match.column,
                  })}
                  onClick={() => onSelect(file, match)}
                  className="flex w-full min-w-0 items-center gap-2 py-1 pl-7 pr-2 text-left font-mono text-xs text-secondary hover:bg-surface-hover focus:bg-surface-active focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  <span className="shrink-0 text-faint">{match.line}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {match.preview_start > 1 && "…"}
                    {match.preview.slice(0, start)}
                    <mark className="rounded-sm bg-accent-bg text-accent-light ring-1 ring-inset ring-accent-border">
                      {match.preview.slice(start, end) || "▏"}
                    </mark>
                    {match.preview.slice(end)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
