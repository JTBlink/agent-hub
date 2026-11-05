import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HerdrAgent } from "@app/herdr";
import { CardActionMenu } from "../CardActionMenu";
import type { ToolInfo } from "../../lib/tauri";
import { TerminalNewMenuContent } from "./TerminalNewMenuContent";

export function TerminalNewMenu({
  disabled,
  tools,
  onNew,
  onNewMarkdown,
  onHerdr,
  herdrBusy,
}: {
  disabled: boolean;
  tools: readonly Pick<ToolInfo, "key" | "installed">[];
  onNew: (agent?: HerdrAgent) => void;
  onNewMarkdown?: () => void;
  onHerdr?: () => void;
  herdrBusy?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <CardActionMenu
      label={t("terminal.newMenu")}
      align="start"
      className="mx-1 self-center"
      triggerClassName="h-7 w-7"
      triggerIcon={<Plus size={15} />}
      actions={[]}
      renderContent={(close) => (
        <TerminalNewMenuContent
          tools={tools}
          terminalDisabled={disabled}
          onNew={onNew}
          onNewMarkdown={onNewMarkdown}
          onHerdr={onHerdr}
          herdrBusy={herdrBusy}
          close={close}
        />
      )}
    />
  );
}
