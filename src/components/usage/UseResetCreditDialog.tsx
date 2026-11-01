import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../ConfirmDialog";
import type { ResetResult } from "../../lib/agentUsage";

/** The key belongs to this confirmed intent and stays unchanged across retries. */
export function UseResetCreditDialog({
  creditId,
  busy,
  onConsume,
  onResult,
  onClose,
}: {
  creditId?: string;
  busy: boolean;
  onConsume: (key: string, creditId?: string) => Promise<ResetResult>;
  onResult: (result: ResetResult) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [key] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  return (
    <div className="fixed inset-0 z-[110]">
      <ConfirmDialog
        open
        confirmDisabled={busy}
        tone="warning"
        title={t("agentUsage.resetCredits.use")}
        message={t("agentUsage.resetCredits.confirm")}
        confirmLabel={t("agentUsage.resetCredits.use")}
        onClose={onClose}
        onConfirm={async () => {
          setError("");
          try {
            onResult(await onConsume(key, creditId));
          } catch (error) {
            const status = typeof error === "string" ? error : "query_failed";
            setError(
              `${t("agentUsage.resetCredits.failed")} ${t(`agentUsage.status.${status}`, { defaultValue: t("agentUsage.status.query_failed") })}`,
            );
            return false;
          }
        }}
      >
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
