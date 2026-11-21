import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { platformUrl } from "../lib/platformLinks";

export function PlatformOpenButton({
  url,
  host,
  label,
  children,
  className,
}: {
  url: string | null;
  host: string;
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const safe = url && platformUrl(url, host);
  if (!safe) return null;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={className ?? "app-button-ghost h-7 w-7 shrink-0 p-0"}
      onClick={() =>
        void openUrl(safe).catch(() => toast.error(t("common.error")))
      }
    >
      {children ?? <ExternalLink size={14} aria-hidden="true" />}
    </button>
  );
}
