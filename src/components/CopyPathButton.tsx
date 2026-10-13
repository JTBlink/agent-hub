import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorMessage } from "../lib/error";

export function CopyPathButton({
  path,
  disabled = false,
}: {
  path: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [copying, setCopying] = useState(false);
  const copyPath = async () => {
    setCopying(true);
    try {
      await writeText(path);
      toast.success(t("common.pathCopied"));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setCopying(false);
    }
  };
  return (
    <button
      type="button"
      disabled={disabled || !path || copying}
      onClick={() => void copyPath()}
      title={t("common.copyPath")}
      aria-label={t("common.copyPath")}
      aria-busy={copying}
      className="inline-flex shrink-0 items-center rounded p-0.5 text-faint transition-colors hover:text-secondary focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
    >
      {copying ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
