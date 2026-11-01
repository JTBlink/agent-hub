import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";

export type WorkspaceFiles = Record<string, { path: string; shown: boolean }>;
export const WorkspaceFilesContext = createContext<{
  files: WorkspaceFiles;
  setFiles: Dispatch<SetStateAction<WorkspaceFiles>>;
} | null>(null);

export function useWorkspaceFiles() {
  const value = useContext(WorkspaceFilesContext);
  if (!value) throw new Error("WorkspaceFilesProvider is required");
  return value;
}
