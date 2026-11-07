import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorMessage } from "../lib/error";
import { cn } from "../utils";
import "@vscode/codicons/dist/codicon.css";

/** Shared VS Code affordance; callers resolve targets and choose where errors appear. */
export function VscodeButton({
  onOpen,
  disabled = false,
  iconOnly = false,
  variant = iconOnly ? "ghost" : "secondary",
  title,
  ariaLabel,
  className,
  labelClassName,
  onError,
  onOpeningChange,
}: {
  onOpen?: () => Promise<unknown>;
  disabled?: boolean;
  iconOnly?: boolean;
  variant?: "secondary" | "ghost";
  title?: string;
  ariaLabel?: string;
  className?: string;
  labelClassName?: string;
  onError?: (message: string | null) => void;
  onOpeningChange?: (opening: boolean) => void;
}) {
  const { t } = useTranslation();
  const label = t("common.openInVscode");
  const [opening, setOpening] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const open = async () => {
    if (!onOpen || disabled || pending.current) return;
    pending.current = true;
    setOpening(true);
    onOpeningChange?.(true);
    onError?.(null);
    try {
      await onOpen();
    } catch (cause) {
      if (mounted.current) {
        const message = getErrorMessage(cause, t("common.error"));
        if (onError) onError(message);
        else toast.error(message);
      }
    } finally {
      pending.current = false;
      if (mounted.current) {
        setOpening(false);
        onOpeningChange?.(false);
      }
    }
  };
  return (
    <button
      type="button"
      disabled={disabled || !onOpen || opening}
      aria-label={ariaLabel ?? label}
      title={title ?? label}
      aria-busy={opening}
      onClick={() => void open()}
      className={cn(
        variant === "ghost" ? "app-button-ghost" : "app-button-secondary",
        iconOnly
          ? "h-6 w-6 shrink-0 p-0 text-muted hover:text-accent-light"
          : "text-xs",
        "disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      {opening ? (
        <Loader2
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 animate-spin"
        />
      ) : (
        <span
          aria-hidden="true"
          className="codicon codicon-vscode shrink-0"
          style={{ fontSize: 14, lineHeight: 1 }}
        />
      )}
      {!iconOnly && <span className={labelClassName}>{label}</span>}
    </button>
  );
}
