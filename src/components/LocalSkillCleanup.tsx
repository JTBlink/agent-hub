import { useState } from "react";
import { BrushCleaning, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { compactHomePath } from "../utils";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  disabled: boolean;
  runScan: () => Promise<void>;
  onChanged: () => Promise<void>;
}

export function LocalSkillCleanup({ disabled, runScan, onChanged }: Props) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<api.LocalCleanupLocation[] | null>(null);
  const [agent, setAgent] = useState("");
  const selected = (plan ?? []).filter(
    (entry) => !agent || entry.tool === agent,
  );
  const agents = [...new Set((plan ?? []).map((entry) => entry.tool))].sort();
  const [loading, setLoading] = useState(false);
  const [failures, setFailures] = useState<api.LocalCleanupResult["failures"]>(
    [],
  );
  const preview = async () => {
    setLoading(true);
    try {
      const locations = await api.getLocalCleanupPlan();
      setFailures([]);
      if (!locations.length) toast.info(t("install.scan.cleanupEmpty"));
      else {
        setAgent("");
        setPlan(locations);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setLoading(false);
    }
  };
  const clean = async (): Promise<void | false> => {
    if (!plan || selected.length === 0) return false;
    setLoading(true);
    let result: api.LocalCleanupResult;
    try {
      result = await api.cleanupUninstalledAgentSkills(
        selected.map((entry) => entry.id),
      );
    } catch (error: unknown) {
      setLoading(false);
      toast.error(getErrorMessage(error, t("common.error")));
      return false;
    }
    // Keep failure paths human-readable if a location disappeared from the
    // backend's new eligibility check after the user reviewed the preview.
    setFailures(
      result.failures.map((failure) => ({
        ...failure,
        path:
          plan.find((entry) => entry.id === failure.path)?.path ?? failure.path,
      })),
    );
    setPlan(null);
    setLoading(false);
    toast[result.failures.length ? "warning" : "success"](
      t("install.scan.cleanupDone", {
        count: result.removed,
        failed: result.failures.length,
      }),
    );
    void Promise.allSettled([runScan(), onChanged()]).then((results) => {
      if (results.some((result) => result.status === "rejected"))
        toast.error(t("install.scan.refreshFailed"));
    });
  };
  return (
    <>
      <button
        type="button"
        onClick={preview}
        disabled={disabled || loading}
        className="app-button-secondary text-[13px] disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <BrushCleaning className="h-3.5 w-3.5" />
        )}
        {t("install.scan.cleanup")}
      </button>
      <ConfirmDialog
        open={plan !== null}
        onClose={() => {
          if (!loading) setPlan(null);
        }}
        title={t("install.scan.cleanupTitle")}
        confirmLabel={t("install.scan.cleanupConfirm")}
        tone="danger"
        onConfirm={clean}
        message={t("install.scan.cleanupHint", { count: selected.length })}
        children={
          <div className="space-y-3">
            <label className="block text-[13px]">
              <span className="mb-1 block">
                {t("install.scan.cleanupAgent")}
              </span>
              <select
                className="app-input w-full"
                disabled={loading}
                value={agent}
                onChange={(event) => setAgent(event.target.value)}
                aria-label={t("install.scan.cleanupAgent")}
              >
                <option value="">{t("install.scan.cleanupAllAgents")}</option>
                {agents.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
            <ul className="max-h-56 overflow-y-auto space-y-2 text-[13px]">
              {selected.map((entry) => (
                <li key={entry.id} className="break-all">
                  <span className="font-medium">{entry.tool}</span>
                  <p className="font-mono text-muted">
                    {compactHomePath(entry.path)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-muted">
              {t("install.scan.cleanupSafety")}
            </p>
          </div>
        }
      />
      {failures.length > 0 && (
        <section
          role="status"
          className="fixed bottom-4 right-4 z-50 max-w-lg rounded-lg border border-border bg-surface p-4 shadow-xl"
        >
          <div className="flex justify-between gap-4">
            <p className="text-[13px] font-semibold">
              {t("install.scan.cleanupFailures")}
            </p>
            <button
              type="button"
              onClick={() => setFailures([])}
              className="text-[13px] text-muted"
            >
              {t("common.close")}
            </button>
          </div>
          <ul className="mt-2 max-h-52 overflow-y-auto text-[12px] text-muted">
            {failures.map((failure, index) => (
              <li className="mb-2 break-all" key={index}>
                <p className="font-mono">{compactHomePath(failure.path)}</p>
                <p>{failure.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
