import { lazy, Suspense } from "react";
import type { SidebarPanelRequest } from "../../../lib/sidebarSections";
const Panel = lazy(() =>
  import("./SidebarHerdr").then(({ SidebarHerdr }) => ({
    default: SidebarHerdr,
  })),
);
export function SidebarHerdr(props: {
  active: boolean;
  request?: SidebarPanelRequest;
}) {
  return (
    <Suspense fallback={null}>
      <Panel {...props} />
    </Suspense>
  );
}
