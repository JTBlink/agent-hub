import { useState, type ReactNode } from "react";
import {
  GitReferenceActionsContext,
  type GitTagRequest,
} from "./gitReferenceActions";
import type { CommitTarget } from "./GitCommitDetails";
import { GitTagActionDialog } from "./GitTagActionDialog";

/** One action flow and repository lock serve reference lists and graph badges. */
export function GitTagActionsProvider({
  target,
  busy,
  openGraph,
  refresh,
  onRun,
  children,
}: {
  target?: CommitTarget;
  busy: boolean;
  openGraph: (sha: string) => void;
  refresh: () => void;
  onRun: (operation: () => Promise<void>) => Promise<boolean>;
  children: ReactNode;
}) {
  const [request, setRequest] = useState<GitTagRequest>();
  return (
    <GitReferenceActionsContext.Provider
      value={
        target
          ? {
              busy,
              openGraph,
              refresh,
              request: setRequest,
            }
          : undefined
      }
    >
      {children}
      {target && request && (
        <GitTagActionDialog
          key={`${request.action}:${request.name}`}
          target={target}
          request={request}
          busy={busy}
          onRun={onRun}
          onClose={() => setRequest(undefined)}
        />
      )}
    </GitReferenceActionsContext.Provider>
  );
}
