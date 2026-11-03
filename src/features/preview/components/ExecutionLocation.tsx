import { useTranslation } from "react-i18next";
import type { ExecutionLocation as Execution } from "../api";
export function ExecutionLocation({
  execution,
  markdown,
}: {
  execution?: Execution;
  markdown?: boolean;
}) {
  const { t } = useTranslation();
  const location = markdown
    ? { render: "client", network: "client_default" }
    : execution;
  return (
    <div className="preview-execution" aria-live="polite">
      {location ? (
        <>
          <span>{t(`preview.renderLocation.${location.render}`)}</span>
          <span>{t(`preview.networkLocation.${location.network}`)}</span>
        </>
      ) : (
        <span>{t("preview.locationPending")}</span>
      )}
    </div>
  );
}
