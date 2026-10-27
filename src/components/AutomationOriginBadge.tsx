import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";
import type { AutomationTaskOrigin } from "../lib/tauri";
import { cn } from "../utils";

export function AutomationOriginBadge({
  origin,
}: {
  origin: AutomationTaskOrigin;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-4",
        origin === "agent_hub"
          ? "border-accent-border bg-accent-bg text-accent-light"
          : "border-border-subtle text-muted",
      )}
    >
      {origin === "agent_hub" && (
        <Layers aria-hidden="true" className="h-3 w-3" />
      )}
      {t(`automation.origins.${origin}`)}
    </span>
  );
}
