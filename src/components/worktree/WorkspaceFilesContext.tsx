import { useState, type ReactNode } from "react";
import {
  WorkspaceFilesContext,
  type WorkspaceFiles,
  type ActiveCheckout,
} from "../../hooks/useWorkspaceFiles";

/** Files belong to a checkout; navigation and sidebar visibility preserve them. */
export function WorkspaceFilesProvider({ children }: { children: ReactNode }) {
  const [checkout, setCheckout] = useState<ActiveCheckout>();
  const [files, setFiles] = useState<WorkspaceFiles>({});
  return (
    <WorkspaceFilesContext.Provider
      value={{ files, setFiles, checkout, setCheckout }}
    >
      {children}
    </WorkspaceFilesContext.Provider>
  );
}
