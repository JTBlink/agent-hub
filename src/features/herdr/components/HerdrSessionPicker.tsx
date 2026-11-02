import { useTranslation } from "react-i18next";
import {
  DEFAULT_HERDR_SESSION,
  type HerdrSessionInfo,
} from "../lib/herdrControlApi";
import { ThemedSelect } from "../../../components/ThemedSelect";
import { HerdrDeleteSession } from "./HerdrDeleteSession";

export function HerdrSessionPicker({
  session,
  inventory,
  disabled,
  onChange,
  onRefresh,
}: {
  session: string;
  inventory: { installed: boolean; sessions: HerdrSessionInfo[] } | null;
  disabled: boolean;
  onChange: (session: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <span className="shrink-0 text-xs font-semibold text-secondary">
        {t("herdr.session")}
      </span>
      <ThemedSelect
        fitContent
        className="min-w-0 flex-1 text-xs"
        aria-label={t("herdr.session")}
        value={session}
        disabled={disabled || !inventory?.installed}
        onChange={(e) => onChange(e.target.value)}
      >
        {!inventory?.sessions.some((s) => s.name === session) && (
          <option value={session}>{session}</option>
        )}
        {inventory?.sessions.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
            {s.running ? "" : ` · ${t("herdr.stopped")}`}
          </option>
        ))}
      </ThemedSelect>
      {inventory?.installed && (
        <HerdrDeleteSession
          session={inventory.sessions.find((s) => s.name === session)}
          disabled={disabled}
          onDeleted={() => {
            onChange(DEFAULT_HERDR_SESSION);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
