import { useTranslation } from "react-i18next";
import { CopyTextButton } from "./CopyTextButton";

export function CopyPathButton({
  path,
  disabled = false,
}: {
  path: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <CopyTextButton
      text={path}
      disabled={disabled}
      label={t("common.copyPath")}
      copiedMessage={t("common.pathCopied")}
    />
  );
}
