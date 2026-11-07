import { createContext, useContext } from "react";
import { usePlatformAccountSummary } from "./usePlatformAccountSummary";
export const PlatformAccountsContext = createContext<ReturnType<
  typeof usePlatformAccountSummary
> | null>(null);
export function usePlatformAccounts(refreshKey = 0) {
  const shared = useContext(PlatformAccountsContext);
  const local = usePlatformAccountSummary(refreshKey, !shared);
  return shared ?? local;
}
