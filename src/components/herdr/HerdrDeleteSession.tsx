import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { deleteHerdrSession, type HerdrSessionInfo } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/error";
import { ConfirmDialog } from "../ConfirmDialog";

export function HerdrDeleteSession({
  session,
  disabled,
  onDeleted,
}: {
  session?: HerdrSessionInfo;
  disabled: boolean;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState("");
  const protectedSession = session?.default || session?.name === "default";
  return (
    <>
      <button
        className="app-button-ghost rounded p-1 text-danger focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={t("herdr.deleteSession")}
        title={t(
          protectedSession ? "herdr.keepDefault" : "herdr.deleteSession",
        )}
        disabled={disabled || !session || protectedSession}
        onClick={() => {
          setError("");
          setTarget(session!.name);
        }}
      >
        <Trash2 size={14} />
      </button>
      <ConfirmDialog
        open={target !== null}
        title={t("herdr.deleteSession")}
        message={t("herdr.deleteSessionHelp", { name: target })}
        onClose={() => setTarget(null)}
        onConfirm={async () => {
          if (!target) return false;
          setError("");
          try {
            await deleteHerdrSession(target);
            onDeleted();
          } catch (error) {
            setError(getErrorMessage(error, t("common.error")));
            return false;
          }
        }}
      >
        {error && (
          <p role="alert" className="text-xs text-danger whitespace-pre-wrap">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
