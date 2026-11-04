import { useContext, useState } from "react";
import { GitEditorTabsContext } from "./gitEditorVisibility";
import type { CommitFileSelection } from "../components/git/GitCommitDetails";

export function useGitEditors(scope: string) {
  const shared = useContext(GitEditorTabsContext);
  const [state, setState] = useState({
    scope,
    graph: false,
    active: "working",
    files: [] as CommitFileSelection[],
  });
  if (state.scope !== scope)
    setState({ scope, graph: false, active: "working", files: [] });
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
        return {
          ...previous,
          files,
          graph,
          active:
            previous.active === id
              ? graph
                ? "graph"
                : files.length
                  ? fileId(files[files.length - 1])
                  : "working"
              : previous.active,
        };
      }),
  };
}
export type GitEditors = ReturnType<typeof useGitEditors>;
