import { useCallback, useState } from "react";

/** Shared controlled disclosure state, reset synchronously when the owning scope changes. */
export function useDisclosures(scope: string | number = 0) {
  const [state, setState] = useState({ scope, opened: new Set<string>() });
  const opened = state.scope === scope ? state.opened : new Set<string>();
  const setOpen = useCallback(
    (id: string, open: boolean) => {
      setState((previous) => {
        const current =
          previous.scope === scope ? previous.opened : new Set<string>();
        if (previous.scope === scope && current.has(id) === open)
          return previous;
        const next = new Set(current);
        if (open) next.add(id);
        else next.delete(id);
        return { scope, opened: next };
      });
    },
    [scope],
  );
  const collapseAll = useCallback(
    () => setState({ scope, opened: new Set<string>() }),
    [scope],
  );
  return { opened, setOpen, collapseAll };
}
