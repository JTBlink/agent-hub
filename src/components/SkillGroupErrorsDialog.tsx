import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "../lib/error";
import type { SkillGroupErrorNotice } from "../lib/skillGroupErrors";

export function SkillGroupErrorsDialog({
  notices,
  onClose,
  onForceSync,
  onComplete,
}: {
  notices: SkillGroupErrorNotice[];
  onClose: () => void;
  onForceSync?: (skillId: string, agentKey: string) => Promise<void>;
  onComplete?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [forcingKey, setForcingKey] = useState<string | null>(null);
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (notices.length > 0 && !dialog?.open) {
      setResolvedKeys(new Set());
      dialog?.showModal();
    } else if (notices.length === 0 && dialog?.open) dialog.close();
  }, [notices]);

  const handleForceOverride = useCallback(
    async (skillId: string, agentKey: string) => {
      if (!onForceSync || forcingKey !== null) return;
      const key = `${skillId}:${agentKey}`;
      setForcingKey(key);
      try {
        await onForceSync(skillId, agentKey);
        setResolvedKeys((prev) => new Set(prev).add(key));
        await onComplete?.();
      } catch (e) {
        toast.error(getErrorMessage(e, t("common.error")));
      } finally {
        setForcingKey(null);
      }
    },
    [onForceSync, onComplete, forcingKey, t],
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        if (forcingKey !== null) event.preventDefault();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-xl border border-border bg-surface p-5 text-primary shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <h2 id={titleId} className="mb-4 text-[14px] font-semibold">
        {t("skillGroupActions.operationDetails")}
      </h2>
      <div className="max-h-[calc(65vh/var(--app-scale))] space-y-4 overflow-y-auto">
        {notices.map((notice) => (
          <section key={notice.kind}>
            <h3 className="mb-2 text-[13px] font-medium">
              {t(
                notice.kind === "conflict"
                  ? "skillGroupActions.partialSkippedToast"
                  : "skillGroupActions.partialFailedToast",
                { count: notice.count },
              )}
            </h3>
            <ul className="space-y-2">
              {notice.items.map((item, index) => {
                const key = `${item.skillId}:${item.agentKey}`;
                const resolved = resolvedKeys.has(key);
                const forcing = forcingKey === key;
                return (
                  <li
                    key={index}
                    className="select-text rounded-lg border border-border-subtle p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="break-all text-[13px] font-medium">
                          {item.skillName} · {item.agentKey}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-all text-[12px] leading-5 text-secondary">
                          {item.message}
                        </p>
                      </div>
                      {notice.kind === "conflict" &&
                        onForceSync &&
                        !resolved && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleForceOverride(
                                item.skillId,
                                item.agentKey,
                              )
                            }
                            disabled={forcingKey !== null}
                            className="shrink-0 rounded-md border border-amber-400/50 bg-amber-500/8 px-2.5 py-1 text-[12px] font-medium text-amber-600 transition-colors hover:bg-amber-500/15 disabled:opacity-50 dark:text-amber-400"
                          >
                            {forcing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              t("skillGroupActions.forceOverride")
                            )}
                          </button>
                        )}
                      {resolved && (
                        <span className="shrink-0 text-[12px] text-green-600 dark:text-green-400">
                          {t("skillGroupActions.overridden")}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <form method="dialog" className="mt-4 flex justify-end">
        <button
          disabled={forcingKey !== null}
          className="app-button-primary disabled:opacity-50"
        >
          {t("common.confirm")}
        </button>
      </form>
    </dialog>
  );
}
