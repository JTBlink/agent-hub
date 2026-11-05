import { createContext, useContext } from "react";
import type { PreviewDocument } from "../features/preview/api";
export interface WorktreePreview {
  scope: string;
  path: string;
  document: PreviewDocument;
  sourceUrl?: string;
}
export const WorktreePreviewsContext = createContext<{
  tabs: WorktreePreview[];
  selected: string | null;
  select: (id: string | null) => void;
  open: (
    projectId: string,
    worktreePath: string,
    path: string,
    url?: string,
  ) => Promise<void>;
  close: (id: string) => void;
  registerClose: (id: string, guard: () => boolean) => () => void;
} | null>(null);
export const useWorktreePreviews = () => useContext(WorktreePreviewsContext);
