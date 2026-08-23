import { useEffect } from "react";

import {
  EmbeddedBrowser,
  type BrowserNavigationRequest,
} from "./EmbeddedBrowser";
import { PageNavigation } from "./PageNavigation";

export function BrowserPage({
  request,
  title,
  onClose,
}: {
  request: BrowserNavigationRequest;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="page browser-page"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 浏览器`}
    >
      <PageNavigation
        className="page-navigation-fullscreen"
        backLabel="退出浏览器"
        onBack={onClose}
        title={title}
        actions={
          <button
            className="button button-ghost browser-page-close"
            type="button"
            onClick={onClose}
            aria-label="关闭浏览器"
            title="关闭浏览器"
          >
            <span aria-hidden="true">×</span>
            <span>关闭</span>
          </button>
        }
      />
      <EmbeddedBrowser request={request} />
    </div>
  );
}
