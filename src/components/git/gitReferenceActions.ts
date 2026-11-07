import { createContext } from "react";
import type { GitTagAction } from "../../lib/gitApi";

export interface GitTagRequest {
  action: GitTagAction;
  name: string;
  sha: string | null;
}
export const GitReferenceActionsContext = createContext<
  | {
      busy: boolean;
      openGraph: (sha: string) => void;
      request: (request: GitTagRequest) => void;
      refresh: () => void;
    }
  | undefined
>(undefined);
