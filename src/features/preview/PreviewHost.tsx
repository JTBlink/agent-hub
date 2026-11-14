import { useNavigate } from "react-router-dom";
import { PREVIEW_OPEN_EVENT } from "./shared/openRequests";
import {
  Component,
  lazy,
  Suspense,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useExternalPreviewOpens } from "./shared/useExternalPreviewOpens";
const Workspace = lazy(() =>
  import("./PreviewWorkspace").then((module) => ({
    default: module.PreviewWorkspace,
  })),
);

/** A failed lazy import must not unmount the surrounding workbench. */
class PreviewLoadBoundary extends Component<{
  children: ReactNode;
  fallback: ReactNode;
}> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
/** Keep owned preview sessions alive when another workbench module is selected. */
export function PreviewHost({
  active,
  deliveryAdapter,
  workspacePath,
}: {
  active: boolean;
  deliveryAdapter?: import("../../lib/agentDelivery").AgentDeliveryAdapter;
  workspacePath?: string;
}) {
  const { t } = useTranslation();
  useExternalPreviewOpens();
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
      <PreviewLoadBoundary
        fallback={
          <div
            role="alert"
            className="flex flex-1 flex-col items-start gap-3 p-6 text-sm text-secondary"
          >
            <p>{t("preview.loadFailed")}</p>
            <button
              type="button"
              className="app-button-secondary px-3 py-1.5"
              onClick={() => window.location.reload()}
            >
              {t("preview.reloadApp")}
            </button>
          </div>
        }
      >
        <Suspense
          fallback={<div role="status" className="flex-1 bg-background" />}
        >
          <Workspace
            shown={active}
            deliveryAdapter={deliveryAdapter}
            workspacePath={workspacePath}
          />
        </Suspense>
      </PreviewLoadBoundary>
    </div>
  );
}
