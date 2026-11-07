import type { ReactNode } from "react";
import { PlatformAccountsContext } from "./usePlatformAccounts";
import { usePlatformAccountSummary } from "./usePlatformAccountSummary";
/** The account entry and dialog share one bounded identity snapshot. */
export function PlatformAccountsProvider({
  refreshKey,
  children,
}: {
  refreshKey: number;
  children: ReactNode;
}) {
  const accounts = usePlatformAccountSummary(refreshKey);
  return (
    <PlatformAccountsContext.Provider value={accounts}>
      {children}
    </PlatformAccountsContext.Provider>
  );
}
