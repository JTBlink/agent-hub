import {
  ChevronDown,
  Download,
  LayoutGrid,
  Layers,
  Loader2,
  PanelLeft,
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
  onHerdrSidebar: () => void;
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
  onHerdrSidebar,
  onSplit,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-1">
      {showTerminalActions && (
        <>
          <CardActionMenu
            label="Herdr"
            disabled={!hasTerminal}
            triggerClassName="h-7 w-auto gap-1 px-2 text-xs"
            triggerIcon={
              <>
                {herdrBusy && (
                  <Loader2
                    size={12}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                <span>Herdr{updateVersion ? " •" : ""}</span>
                <ChevronDown size={12} aria-hidden="true" />
              </>
            }
            actions={[
              {
                key: "launch",
                label: t("terminal.herdrLaunch"),
                icon: <TerminalSquare size={14} />,
                disabled: herdrBusy,
                onSelect: onHerdr,
              },
              {
                key: "sidebar",
                label: t("terminal.herdrSidebar"),
                icon: <PanelLeft size={14} />,
                disabled: herdrBusy,
                onSelect: onHerdrSidebar,
              },
              ...(updateVersion && onHerdrUpgrade
                ? [
                    {
                      key: "upgrade",
                      label: t("terminal.herdrUpdateAvailable", {
                        version: updateVersion,
                      }),
                      icon: <Download size={14} />,
                      disabled: herdrBusy,
                      onSelect: onHerdrUpgrade,
                    },
                  ]
                : []),
            ]}
          />
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
