import { useRef, useState } from "react";
import { FolderOpen, RotateCcw, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openAutomationWorkspace } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { CardActionMenu } from "./CardActionMenu";

export function AutomationPageMenu({
  onRestore,
  onConfiguration,
  onError,
}: {
  onRestore: () => void;
  onConfiguration: () => void;
  onError: (error: string | null) => void;
}) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const pending = useRef(false);
  const openDirectory = async () => {
    if (pending.current) return;
    pending.current = true;
    setOpening(true);
    onError(null);
    try {
      await openAutomationWorkspace();
    } catch (error) {
      onError(getErrorMessage(error, t("common.requestFailed")));
    } finally {
      pending.current = false;
      setOpening(false);
    }
  };
  return (
    <CardActionMenu
      label={t("automation.more")}
      className="[&>button]:h-9 [&>button]:w-9"
      actions={[
        {
          key: "restore",
          label: t("automation.restoreBackup"),
          icon: <RotateCcw className="h-3.5 w-3.5" />,
          onSelect: onRestore,
        },
        {
          key: "config-info",
          label: t("automation.configurationInfo"),
          icon: <Settings2 className="h-3.5 w-3.5" />,
          onSelect: onConfiguration,
        },
        {
          key: "open-root",
          label: t("automation.openTasksDirectory"),
          icon: <FolderOpen className="h-3.5 w-3.5" />,
          disabled: opening,
          onSelect: () => void openDirectory(),
        },
      ]}
    />
  );
}
