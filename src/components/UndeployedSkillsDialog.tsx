import { useEffect, useId, useRef } from "react";
import { ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ManagedSkill } from "../lib/tauri";

interface Props {
  open: boolean;
  skills: ManagedSkill[];
  onClose: () => void;
  onOpenSkill: (skillId: string) => void;
}

export function UndeployedSkillsDialog({
  open,
  skills,
  onClose,
  onOpenSkill,
}: Props) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog?.open) dialog?.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(85vh/var(--app-scale))] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-primary shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[calc(85vh/var(--app-scale))] flex-col">
        <header className="shrink-0 border-b border-border-subtle px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-sm font-semibold">
              {t("dashboard.undeployedCount", { count: skills.length })}
            </h2>
            <button
              type="button"
              autoFocus
              onClick={onClose}
              aria-label={t("dashboard.closeUndeployed")}
              className="rounded p-1 text-muted hover:bg-surface-hover hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <p
            id={descriptionId}
            className="mt-2 text-xs leading-relaxed text-muted"
          >
            {t("dashboard.undeployedHint")}
          </p>
        </header>
        <ul className="min-h-0 overflow-y-auto divide-y divide-border-subtle">
          {skills.map((skill) => (
            <li key={skill.id}>
              <button
                type="button"
                onClick={() => onOpenSkill(skill.id)}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium text-secondary">
                    {skill.name}
                  </span>
                  <span className="mt-1 block break-words text-xs leading-relaxed text-muted">
                    {skill.description || t("dashboard.noDescription")}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-muted"
                />
              </button>
            </li>
          ))}
        </ul>
        {skills.length === 0 && (
          <p className="px-5 py-8 text-sm text-muted">
            {t("dashboard.noUndeployed")}
          </p>
        )}
      </div>
    </dialog>
  );
}
