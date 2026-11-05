import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorMessage } from "../lib/error";
import { openDirectoryInVscode } from "../lib/openInVscode";
import "@vscode/codicons/dist/codicon.css";

export function OpenProjectInVscode({
  path,
  title,
}: {
  path: string;
  title?: string;
}) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const pending = useRef(false);
  const open = async () => {
    if (!path || pending.current) return;
    pending.current = true;
    setOpening(true);
    try {
      await openDirectoryInVscode(path);
    } catch (cause) {
      toast.error(getErrorMessage(cause, t("common.error")));
    } finally {
      pending.current = false;
      setOpening(false);
    }
  };
  return (
    <button
      type="button"
      disabled={!path || opening}
      aria-label={t("install.scan.openInVscode")}
      title={title ?? t("install.scan.openInVscode")}
      aria-busy={opening}
      onClick={() => void open()}
      className="app-button-ghost h-6 w-6 shrink-0 p-0 text-muted hover:text-accent-light"
    >
      {opening ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <span
          aria-hidden="true"
          className="codicon codicon-vscode"
          style={{ fontSize: 14, lineHeight: 1 }}
        />
      )}
    </button>
  );
}
