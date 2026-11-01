import {
  ArrowDown,
  ArrowUp,
  Columns2,
  FileCode2,
  Map,
  Pilcrow,
  WrapText,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../utils";

export function GitDiffToolbar({
  path,
  split,
  wrap,
  whitespace,
  overview,
  count,
  active,
  onSplit,
  onWrap,
  onWhitespace,
  onOverview,
  onNavigate,
  onOpenFile,
}: {
  path: string;
  split: boolean;
  wrap: boolean;
  whitespace: boolean;
  overview: boolean;
  count: number;
  active: number;
  onSplit: () => void;
  onWrap: () => void;
  onWhitespace: () => void;
  onOverview: () => void;
  onNavigate: (direction: number) => void;
  onOpenFile?: () => void;
}) {
  const { t } = useTranslation();
  const buttons = [
    {
      label: t("git.file"),
      Icon: FileCode2,
      action: onOpenFile,
      disabled: !onOpenFile,
    },
    {
      label: t("git.previousChange"),
      Icon: ArrowUp,
      action: () => onNavigate(-1),
      disabled: !count,
    },
    {
      label: t("git.nextChange"),
      Icon: ArrowDown,
      action: () => onNavigate(1),
      disabled: !count,
    },
    {
      label: t("fileReader.wrap"),
      Icon: WrapText,
      action: onWrap,
      pressed: wrap,
    },
    {
      label: t("git.showWhitespace"),
      Icon: Pilcrow,
      action: onWhitespace,
      pressed: whitespace,
    },
    {
      label: t("git.changeOverview"),
      Icon: Map,
      action: onOverview,
      pressed: overview,
    },
    { label: t("git.split"), Icon: Columns2, action: onSplit, pressed: split },
  ];
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1 border-b border-border-subtle bg-bg-secondary px-2 py-1">
      <span
        className="mr-auto min-w-0 truncate px-1 text-xs text-muted"
        title={path}
      >
        {path}
      </span>
      <div
        role="toolbar"
        aria-label={t("git.diffTools")}
        className="flex shrink-0 items-center gap-0.5"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ];
          const index = buttons.findIndex(
            (button) => button === document.activeElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          event.preventDefault();
          buttons[next]?.focus();
        }}
      >
        <span
          role="status"
          aria-live="polite"
          className="px-1 font-mono text-xs text-muted"
          aria-label={t("git.changePosition", { current: active + 1, count })}
        >
          {active < 0 ? "–" : active + 1}/{count}
        </span>
        {buttons.map(({ label, Icon, action, pressed, disabled }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            onClick={action}
            className={cn(
              "app-button-ghost h-6 w-6 shrink-0 p-0",
              pressed && "bg-surface-active text-accent-light",
            )}
          >
            <Icon size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
