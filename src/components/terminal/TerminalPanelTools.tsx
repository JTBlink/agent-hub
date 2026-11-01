import {
  Download,
  LayoutGrid,
  Layers,
  Loader2,
  TerminalSquare,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CardActionMenu } from "../CardActionMenu";

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
  return (
    <div className="flex shrink-0 items-center gap-1">
      {showTerminalActions && (
        <>
          <button
            type="button"
            aria-label="Herdr"
            title={t("terminal.herdrLaunch")}
            aria-busy={herdrBusy}
            disabled={!hasTerminal}
            className="app-button-ghost flex h-7 items-center gap-1 rounded px-2 text-xs"
            onClick={() => {
              if (!herdrBusy) onHerdr();
            }}
          >
            {herdrBusy ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <TerminalSquare size={14} aria-hidden="true" />
            )}
            <span>Herdr</span>
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
