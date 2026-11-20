import { useRef, useState, type MouseEvent } from "react";

/** Selection follows rendered rows, including only expanded directory contents. */
export function useExplorerSelection(scope: string, active?: string) {
  const containerRef = useRef<HTMLElement>(null);
  const [state, setState] = useState({
    scope,
    active,
    anchor: active,
    paths: new Set(active ? [active] : []),
  });
  if (state.scope !== scope || state.active !== active) {
    setState({
      scope,
      active,
      anchor: active,
      paths: new Set(active ? [active] : []),
    });
  }
  const selectEntry = (path: string, event: MouseEvent<HTMLButtonElement>) => {
    const additive = event.metaKey || event.ctrlKey;
    const modified = event.shiftKey || additive;
    if (modified) event.preventDefault();
    const visible = Array.from(
      containerRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-explorer-path]:not(:disabled)",
      ) ?? [],
      (row) => row.dataset.explorerPath!,
    );
    const paths = new Set(
      additive ? visible.filter((entry) => state.paths.has(entry)) : [],
    );
    const start = state.anchor ? visible.indexOf(state.anchor) : -1;
    const end = visible.indexOf(path);
    if (event.shiftKey && start >= 0 && end >= 0) {
      for (const entry of visible.slice(
        Math.min(start, end),
        Math.max(start, end) + 1,
      ))
        paths.add(entry);
    } else if (additive && paths.has(path)) paths.delete(path);
    else paths.add(path);
    setState({
      ...state,
      anchor: event.shiftKey && start >= 0 ? state.anchor : path,
      paths,
    });
    return modified;
  };
  const contextEntries = (path: string, directory: boolean) => {
    const rows = Array.from(
      containerRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-explorer-path]:not(:disabled)",
      ) ?? [],
    );
    const entries = state.paths.has(path)
      ? rows
          .filter((row) => state.paths.has(row.dataset.explorerPath!))
          .map((row) => ({
            path: row.dataset.explorerPath!,
            directory: row.dataset.explorerDirectory === "true",
          }))
      : [];
    if (!entries.length) entries.push({ path, directory });
    setState({
      ...state,
      paths: new Set(entries.map((entry) => entry.path)),
      anchor: state.paths.has(path) ? state.anchor : path,
    });
    return entries;
  };
  return {
    containerRef,
    selectedPaths: state.paths,
    selectEntry,
    contextEntries,
  };
}
