import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { ReaderLocation } from "../components/file-reader/types";

export interface ActiveCheckout {
  projectId: string;
  worktreePath: string;
}

export type WorkspaceFiles = Record<
  string,
  { path: string; shown: boolean; location?: ReaderLocation }
>;
export const WorkspaceFilesContext = createContext<{
  files: WorkspaceFiles;
  checkout?: ActiveCheckout;
  setCheckout: Dispatch<SetStateAction<ActiveCheckout | undefined>>;
  setFiles: Dispatch<SetStateAction<WorkspaceFiles>>;
} | null>(null);

export function useWorkspaceFiles() {
  const value = useContext(WorkspaceFilesContext);
  if (!value) throw new Error("WorkspaceFilesProvider is required");
  return value;
}
