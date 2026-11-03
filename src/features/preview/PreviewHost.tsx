import { useNavigate } from "react-router-dom";
import { PREVIEW_OPEN_EVENT } from "./shared/openRequests";
import { lazy, Suspense, useState, useEffect } from "react";
const Workspace = lazy(() =>
  import("./PreviewWorkspace").then((module) => ({
    default: module.PreviewWorkspace,
  })),
);
/** Keep owned preview sessions alive when another workbench module is selected. */
export function PreviewHost({ active }: { active: boolean }) {
  const [opened, setOpened] = useState(active);
  const navigate = useNavigate();
  useEffect(() => {
    const show = () => navigate("/preview");
    window.addEventListener(PREVIEW_OPEN_EVENT, show);
    return () => window.removeEventListener(PREVIEW_OPEN_EVENT, show);
  }, [navigate]);
  if (active && !opened) setOpened(true);
  if (!opened) return null;
  return (
    <div
      hidden={!active}
      className={active ? "flex min-h-0 min-w-0 flex-1" : "hidden"}
    >
      <Suspense
        fallback={<div role="status" className="flex-1 bg-background" />}
      >
        <Workspace shown={active} />
      </Suspense>
    </div>
  );
}
