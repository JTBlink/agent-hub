import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import type { CardAction } from "../CardActionMenu";
import { getErrorMessage } from "../../lib/error";

/** Clipboard behavior shared by reference lists and graph context menus. */
export function useGitCopyActions(
  entries: { key: string; label: string; text: string }[],
): CardAction[] {
  const { t } = useTranslation();
  const copy = async (text: string) => {
    try {
      await writeText(text);
      toast.success(t("git.referenceCopied"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    }
  };
  return entries.map(({ key, label, text }) => ({
    key,
    label,
    icon: <Copy size={14} />,
    onSelect: () => void copy(text),
  }));
}
