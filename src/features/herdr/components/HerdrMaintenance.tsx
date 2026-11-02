import { useRef, useState } from "react";
import { Download, Info, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import { getErrorMessage } from "../../../lib/error";
import {
  CardActionMenu,
  type CardAction,
} from "../../../components/CardActionMenu";
import { ConfirmDialog } from "../../../components/ConfirmDialog";

/** Installation and daemon lifecycle belong to Herdr, independently of terminals. */
export function HerdrMaintenance({
  session,
  disabled,
  onRefresh,
}: {
  session: string;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [update, setUpdate] = useState<api.HerdrUpdate | null>(null);
  const pending = useRef(false);
  const run = async (job: () => Promise<void>) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setNotice("");
    try {
      await job();
      return true;
    } catch (error) {
      setNotice(getErrorMessage(error, t("common.error")));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const actions: CardAction[] = [
    {
      key: "update",
      label: t(
        update?.has_update && update.managed
          ? "herdr.updateVersion"
          : "herdr.checkUpdate",
        { version: update?.latest_version },
      ),
      icon: <Download size={13} />,
      disabled: busy || disabled,
      keepOpen: true,
      onSelect: () =>
        void run(async () => {
          if (update?.has_update && update.managed) {
            await api.updateHerdr();
            setUpdate(null);
            setNotice(t("herdr.updatedRestart"));
            onRefresh();
          } else {
            const result = await api.checkHerdrUpdate();
            setUpdate(result);
            setNotice(
              result.has_update
                ? result.managed
                  ? ""
                  : t("herdr.externalUpdate")
                : t("herdr.upToDate"),
            );
          }
        }),
    },
    {
      key: "restart",
      label: t("herdr.restartSession"),
      icon: <RotateCw size={13} />,
      disabled: busy || disabled || !session,
      onSelect: () => {
        setNotice("");
        setTarget(session);
      },
    },
  ];
  if (busy || notice)
    actions.push({
      key: "status",
      label: busy ? t("common.loading") : notice,
      icon: (
        <span title={notice}>
          <Info size={13} />
        </span>
      ),
      disabled: true,
      onSelect: () => {},
    });
  return (
    <>
      <CardActionMenu
        label={t("herdr.moreActions")}
        actions={actions}
        disabled={disabled}
      />
      <span role="status" className="sr-only">
        {busy ? t("common.loading") : notice}
      </span>
      <ConfirmDialog
        open={target !== null}
        title={t("herdr.restartSession")}
        message={t("herdr.restartHelp", { name: target })}
        confirmLabel={t("herdr.restartSession")}
        onClose={() => setTarget(null)}
        onConfirm={async () => {
          if (!target) return false;
          const success = await run(async () => {
            await api.restartHerdrSession(target);
            onRefresh();
          });
          if (!success) return false;
        }}
      >
        {notice && (
          <p role="alert" className="text-xs text-danger">
            {notice}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
