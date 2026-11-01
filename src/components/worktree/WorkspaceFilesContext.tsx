import { useState, type ReactNode } from "react";
import {
  WorkspaceFilesContext,
  type WorkspaceFiles,
} from "../../hooks/useWorkspaceFiles";

/** Files belong to a checkout; navigation and sidebar visibility preserve them. */
export function WorkspaceFilesProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<WorkspaceFiles>({});
  return (
    <WorkspaceFilesContext.Provider value={{ files, setFiles }}>
      {children}
    </WorkspaceFilesContext.Provider>
  );
}
