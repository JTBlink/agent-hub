import { useRef, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorMessage } from "../lib/error";
import { cn } from "../utils";

export function CopyTextButton({
  text,
  label,
  copiedMessage,
  disabled = false,
  className,
}: {
  text: string;
  label: string;
  copiedMessage: string;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [copying, setCopying] = useState(false);
  const pending = useRef(false);
  const copy = async () => {
    if (disabled || !text || pending.current) return;
    pending.current = true;
    setCopying(true);
    try {
      await writeText(text);
      toast.success(copiedMessage);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      pending.current = false;
      setCopying(false);
    }
  };
  return (
    <button
      type="button"
      disabled={disabled || !text || copying}
      onClick={() => void copy()}
      title={label}
      aria-label={label}
      aria-busy={copying}
      className={cn(
        "inline-flex shrink-0 items-center rounded p-0.5 text-faint transition-colors hover:text-secondary focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50",
        className,
      )}
    >
      {copying ? (
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Copy aria-hidden="true" className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
