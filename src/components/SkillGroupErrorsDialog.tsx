import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SkillGroupErrorNotice } from "../lib/skillGroupErrors";

export function SkillGroupErrorsDialog({
  notices,
  onClose,
}: {
  notices: SkillGroupErrorNotice[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (notices.length > 0 && !dialog?.open) dialog?.showModal();
    else if (notices.length === 0 && dialog?.open) dialog.close();
  }, [notices]);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
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
              {notice.items.map((item, index) => (
                <li
                  key={index}
                  className="select-text rounded-lg border border-border-subtle p-3"
                >
                  <div className="break-all text-[13px] font-medium">
                    {item.skillName} · {item.agentKey}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-all text-[12px] leading-5 text-secondary">
                    {item.message}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <form method="dialog" className="mt-4 flex justify-end">
        <button className="app-button-primary">{t("common.confirm")}</button>
      </form>
    </dialog>
  );
}
