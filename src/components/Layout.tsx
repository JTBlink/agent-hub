import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { StatusBanner } from "./StatusBanner";
import { CommandPalette } from "./CommandPalette";
import { useApp } from "../context/AppContext";
import { useTranslation } from "react-i18next";
import { useDragWindow } from "../hooks/useDragWindow";
import { cn } from "../utils";

export function Layout() {
  const { t } = useTranslation();
  const { appError, refreshAppData } = useApp();
  const onDrag = useDragWindow();
  const navigate = useNavigate();
  const settingsPage = useLocation().pathname === "/settings";

  // Cmd+, to open Settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        )
          return;
        e.preventDefault();
        navigate("/settings");
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        )
          return;
        e.preventDefault();
        refreshAppData();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, refreshAppData]);

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-background text-primary">
      {/* Full-width top drag bar — spans sidebar + content, with bottom divider */}
      <div
        onMouseDown={onDrag}
        className="absolute inset-x-0 top-0 z-50 h-[28px] border-b border-border-subtle bg-bg-secondary"
      />
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            "min-h-0 flex-1 px-5 pb-5 pt-[calc(28px+20px)] scrollbar-hide",
            settingsPage ? "flex flex-col overflow-hidden" : "overflow-y-auto",
          )}
        >
          <div
            className={cn(
              "mx-auto flex w-full max-w-[1200px] flex-col gap-4",
              settingsPage ? "min-h-0 flex-1" : "min-h-full",
            )}
          >
            {appError ? (
              <StatusBanner
                compact
                title={t("common.dataOutOfDate")}
                description={appError}
                actionLabel={t("common.retry")}
                onAction={refreshAppData}
                tone="danger"
              />
            ) : null}
            <Outlet />
          </div>
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}
