import { WorktreePreviewsProvider } from "../../hooks/useWorktreePreviews";
import { useState, type ReactNode } from "react";
import type { Project } from "../../lib/tauri";
import { projectCheckoutRoute } from "../../lib/worktreeApi";
import {
  WorkspaceFilesContext,
  type WorkspaceFiles,
  type ActiveCheckout,
} from "../../hooks/useWorkspaceFiles";

/** Files belong to a checkout; navigation and sidebar visibility preserve them. */
export function WorkspaceFilesProvider({
  children,
  projects = [],
  pathname = "",
  search = "",
}: {
  children: ReactNode;
  projects?: readonly Project[];
  pathname?: string;
  search?: string;
}) {
  const route = projectCheckoutRoute(pathname, search);
  const project = projects.find((item) => item.id === route?.projectId);
  const routeCheckout = project
    ? {
        projectId: project.id,
        worktreePath: route?.worktreePath ?? project.path,
      }
    : undefined;
  const routeKey = JSON.stringify(routeCheckout);
  const [previousRoute, setPreviousRoute] = useState(routeKey);
  const [checkout, setCheckout] = useState<ActiveCheckout | undefined>(
    routeCheckout,
  );
  // Publish navigation before children render; non-project pages retain that checkout.
  if (previousRoute !== routeKey) {
    setPreviousRoute(routeKey);
    if (routeCheckout) setCheckout(routeCheckout);
  }
  const [files, setFiles] = useState<WorkspaceFiles>({});
  return (
    <WorkspaceFilesContext.Provider
      value={{ files, setFiles, checkout, setCheckout }}
    >
      <WorktreePreviewsProvider>{children}</WorktreePreviewsProvider>
    </WorkspaceFilesContext.Provider>
  );
}
