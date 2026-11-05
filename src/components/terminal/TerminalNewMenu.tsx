import { Plus, TerminalSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { herdrAgents, type HerdrAgent } from "@app/herdr";
import { AgentIcon } from "../AgentIcon";
import { CardActionMenu } from "../CardActionMenu";
import type { ToolInfo } from "../../lib/tauri";

export function TerminalNewMenu({
  disabled,
  tools,
  onNew,
}: {
  disabled: boolean;
  tools: readonly Pick<ToolInfo, "key" | "installed">[];
  onNew: (agent?: HerdrAgent) => void;
}) {
  const { t } = useTranslation();
  return (
    <CardActionMenu
      label={t("terminal.newMenu")}
      disabled={disabled}
      align="start"
      className="mx-1 self-center"
      triggerClassName="h-7 w-7"
      triggerIcon={<Plus size={15} />}
      actions={[
        {
          key: "terminal",
          label: t("terminal.new"),
          icon: <TerminalSquare size={14} />,
          onSelect: () => onNew(),
        },
        ...herdrAgents
          .filter(({ toolKey }) =>
            tools.some((tool) => tool.key === toolKey && tool.installed),
          )
          .map(({ id, label, toolKey }) => ({
            key: id,
            label,
            icon: (
              <AgentIcon
                agentKey={toolKey}
                className="h-4 w-4 border-0 bg-transparent"
              />
            ),
            onSelect: () => onNew(id),
          })),
      ]}
    />
  );
}
