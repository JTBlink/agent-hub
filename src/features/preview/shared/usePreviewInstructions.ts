import { useState } from "react";
import type { PreviewTab } from "./session";

/** Keep unsent requests with their page revision while its inspector is closed. */
export function usePreviewInstructions(
  tabs: PreviewTab[],
  active?: PreviewTab,
) {
  const [requests, setRequests] = useState<
    Record<string, { revision: string; text: string }>
  >({});
  const saved = active && requests[active.id];
  return {
    instruction: saved && saved.revision === active?.revision ? saved.text : "",
    clearInstruction: () => {
      if (!active || !saved) return;
      setRequests((previous) => {
        if (previous[active.id] !== saved) return previous;
        const next = { ...previous };
        delete next[active.id];
        return next;
      });
    },
    setInstruction: (text: string) => {
      if (!active) return;
      setRequests((previous) => ({
        ...Object.fromEntries(
          Object.entries(previous).filter(([id, value]) =>
            tabs.some(
              (tab) => tab.id === id && tab.revision === value.revision,
            ),
          ),
        ),
        [active.id]: { revision: active.revision, text },
      }));
    },
  };
}
