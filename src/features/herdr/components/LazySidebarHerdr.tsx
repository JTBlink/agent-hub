import { lazy, Suspense } from "react";
const Panel = lazy(() =>
  import("./SidebarHerdr").then(({ SidebarHerdr }) => ({
    default: SidebarHerdr,
  })),
);
export function SidebarHerdr(props: { active: boolean }) {
  return (
    <Suspense fallback={null}>
      <Panel {...props} />
    </Suspense>
  );
}
