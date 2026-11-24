import { useContext, useState } from "react";
import { GitEditorTabsContext } from "./gitEditorVisibility";
import type { CommitFileSelection } from "../components/git/GitCommitDetails";

export function useGitEditors(scope: string) {
  const shared = useContext(GitEditorTabsContext);
  const [state, setState] = useState({
    scope,
    graph: false,
    historyPath: undefined as string | undefined,
    graphCommit: undefined as { sha: string } | undefined,
    active: "working",
    files: [] as CommitFileSelection[],
  });
  if (state.scope !== scope)
    setState({
      scope,
      graph: false,
      historyPath: undefined,
      graphCommit: undefined,
      active: "working",
      files: [],
    });
  const fileId = (file: CommitFileSelection) =>
    JSON.stringify([file.sha, file.path, file.view]);
  return {
    ...state,
    fileId,
    select: (active: string) => {
      setState((previous) => ({ ...previous, active }));
      shared?.onSelect();
    },
    openGraph: () => {
      setState((previous) => ({ ...previous, graph: true, active: "graph" }));
      shared?.onSelect();
    },
    openFileHistory: (path: string) => {
      setState((previous) => ({
        ...previous,
        historyPath: path,
        active: "fileHistory",
      }));
      shared?.onSelect();
    },
    revealGraph: (sha: string) => {
      setState((previous) => ({
        ...previous,
        graph: true,
        active: "graph",
        graphCommit: { sha },
      }));
      shared?.onSelect();
    },
    openFile: (file: CommitFileSelection) => {
      shared?.onSelect();
      setState((previous) => ({
        ...previous,
        active: fileId(file),
        files: previous.files.some((item) => fileId(item) === fileId(file))
          ? previous.files
          : [...previous.files, file],
      }));
    },
    close: (id: string) =>
      setState((previous) => {
        const files = previous.files.filter((file) => fileId(file) !== id);
        const graph = id === "graph" ? false : previous.graph;
        const historyPath =
          id === "fileHistory" ? undefined : previous.historyPath;
        return {
          ...previous,
          files,
          graph,
          historyPath,
          active:
            previous.active === id
              ? graph
                ? "graph"
                : historyPath
                  ? "fileHistory"
                  : files.length
                    ? fileId(files[files.length - 1])
                    : "working"
              : previous.active,
        };
      }),
  };
}
export type GitEditors = ReturnType<typeof useGitEditors>;
