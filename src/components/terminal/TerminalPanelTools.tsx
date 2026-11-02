import { Download, LayoutGrid, Layers, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CardActionMenu } from "../CardActionMenu";
import { HerdrIcon } from "../../features/herdr/components/HerdrIcon";

interface Props {
  showTerminalActions?: boolean;
  hasTerminal: boolean;
  herdrBusy: boolean;
  updateVersion?: string;
  onHerdrUpgrade?: () => void;
  canSplit: boolean;
  onProjectSkills?: () => void;
  onHerdr: () => void;
  onSplit: (direction: "horizontal" | "vertical") => void;
}

/** Compact panel controls; Herdr runs inside the selected terminal. */
export function TerminalPanelTools({
  showTerminalActions = true,
  hasTerminal,
  herdrBusy,
  updateVersion,
  onHerdrUpgrade,
  canSplit,
  onProjectSkills,
  onHerdr,
  onSplit,
}: Props) {
  const { t } = useTranslation();
  const herdrIcon = (
    <span
      className="relative flex h-7 w-7 items-center justify-center"
      title={
        updateVersion
          ? t("terminal.herdrUpdateAvailable", { version: updateVersion })
          : undefined
      }
    >
      {herdrBusy ? (
        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
      ) : (
        <HerdrIcon width={20} height={20} />
      )}
      {updateVersion && (
        <span
          role="img"
          aria-label={t("terminal.herdrUpdateAvailable", {
            version: updateVersion,
          })}
          className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-accent-light"
        />
      )}
    </span>
  );
  const herdrTitle = updateVersion
    ? `${t("terminal.herdrLaunch")} · ${t("terminal.herdrUpdateAvailable", { version: updateVersion })}`
    : t("terminal.herdrLaunch");
  return (
    <div className="flex shrink-0 items-center gap-1">
      {showTerminalActions && (
        <>
          <button
            type="button"
            aria-label="Herdr"
            title={herdrTitle}
            aria-busy={herdrBusy}
            disabled={!hasTerminal}
            className="app-button-ghost relative flex h-7 w-7 items-center justify-center rounded"
            onClick={() => {
              if (!herdrBusy) onHerdr();
            }}
          >
            {herdrIcon}
          </button>
          {updateVersion && onHerdrUpgrade && (
            <button
              type="button"
              aria-label={t("terminal.herdrUpdateAvailable", {
                version: updateVersion,
              })}
              title={t("terminal.herdrUpdateAvailable", {
                version: updateVersion,
              })}
              disabled={!hasTerminal || herdrBusy}
              className="app-button-ghost flex h-7 items-center rounded px-1.5"
              onClick={onHerdrUpgrade}
            >
              <Download size={14} aria-hidden="true" />
            </button>
          )}
        </>
      )}
      {(showTerminalActions || onProjectSkills) && (
        <CardActionMenu
          label={t("common.more")}
          disabled={!canSplit && !onProjectSkills}
          triggerIcon={<LayoutGrid size={16} />}
          triggerClassName="h-7 w-7"
          actions={[
            ...(onProjectSkills
              ? [
                  {
                    key: "project-skills",
                    label: t("worktree.projectSkills"),
                    icon: <Layers size={14} />,
                    onSelect: onProjectSkills,
                  },
                ]
              : []),
            {
              key: "horizontal",
              label: t("terminal.splitHorizontal"),
              disabled: !canSplit,
              onSelect: () => onSplit("horizontal"),
            },
            {
              key: "vertical",
              label: t("terminal.splitVertical"),
              disabled: !canSplit,
              onSelect: () => onSplit("vertical"),
            },
          ]}
        />
      )}
    </div>
  );
}
