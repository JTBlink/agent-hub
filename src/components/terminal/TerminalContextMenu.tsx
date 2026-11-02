import { useRef, useState, type RefObject } from "react";
import type { Terminal } from "@xterm/xterm";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CardActionMenu } from "../CardActionMenu";
import { getErrorMessage } from "../../lib/error";

/** Mouse-aware TUIs own their context menu; shell actions reuse the app menu. */
export function TerminalContextMenu({
  target,
  terminal,
  herdr,
  onCopy,
}: {
  target: RefObject<HTMLDivElement | null>;
  terminal: RefObject<Terminal | null>;
  herdr: boolean;
  onCopy: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(false);
  const wasOpen = useRef(false);
  return (
    <CardActionMenu
      contextOnly
      contextTarget={target}
      label={t("terminal.contextMenu")}
      shouldOpenContextMenu={() =>
        !!terminal.current &&
        !herdr &&
        terminal.current.modes.mouseTrackingMode === "none"
      }
      onOpenChange={(open) => {
        if (open) setSelected(terminal.current?.hasSelection() ?? false);
        else if (wasOpen.current) terminal.current?.focus();
        wasOpen.current = open;
      }}
      actions={[
        {
          key: "copy",
          label: t("terminal.copySelection"),
          disabled: !selected,
          onSelect: onCopy,
        },
        {
          key: "paste",
          label: t("terminal.paste"),
          onSelect: () => {
            const requested = terminal.current;
            if (!requested) return;
            void readText()
              .then((text) => {
                if (terminal.current === requested) requested.paste(text);
              })
              .catch((error) =>
                toast.error(
                  getErrorMessage(error, t("terminal.clipboardFailed")),
                ),
              );
          },
        },
        {
          key: "select-all",
          label: t("terminal.selectAll"),
          onSelect: () => terminal.current?.selectAll(),
        },
        {
          key: "clear",
          label: t("herdr.clear"),
          onSelect: () => terminal.current?.clear(),
        },
      ]}
    />
  );
}
