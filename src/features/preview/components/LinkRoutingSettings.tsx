import { useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "../../../components/ThemedSelect";
import { getSettings, setSettings } from "../../../lib/tauri";
import {
  LINK_DESTINATION_KEY,
  linkDestination,
  type LinkDestination,
} from "../../../lib/openWebLink";
export function LinkRoutingSettings({
  onError,
}: {
  onError: (error: unknown) => void;
}) {
  const { t } = useTranslation();
  const report = useEffectEvent(onError);
  const [value, setValue] = useState<LinkDestination>("system");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let disposed = false;
    getSettings(LINK_DESTINATION_KEY)
      .then((result) => {
        if (!disposed) setValue(linkDestination(result));
      })
      .catch((error) => {
        if (!disposed) report(error);
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });
    return () => {
      disposed = true;
    };
  }, []);
  return (
    <section>
      <h3>
        <label htmlFor="preview-link-destination">
          {t("preview.linkDestination")}
        </label>
      </h3>
      <ThemedSelect
        id="preview-link-destination"
        value={value}
        disabled={busy}
        onChange={async (event) => {
          const next = linkDestination(event.target.value);
          setBusy(true);
          try {
            await setSettings(LINK_DESTINATION_KEY, next);
            setValue(next);
          } catch (error) {
            onError(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <option value="system">{t("preview.systemBrowser")}</option>
        <option value="preview">{t("preview.moduleBrowser")}</option>
      </ThemedSelect>
      <p className="my-2 text-xs leading-6 text-muted">
        {t("preview.linkDestinationHint")}
      </p>
      <p className="my-2 text-xs leading-6 text-muted">
        {t("preview.fileLinkDestinationHint")}
      </p>
    </section>
  );
}
