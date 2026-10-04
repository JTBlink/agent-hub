import { ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { RELEASES_URL } from "../lib/distribution";

export function ModuleReleaseLink({ className }: { className: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        openUrl(RELEASES_URL).catch(() => toast.error(t("common.error")));
      }}
    >
      <ExternalLink className="w-3 h-3" />
      {t("settings.hostReleases")}
    </button>
  );
}
