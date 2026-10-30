import { useTranslation } from "react-i18next";
import { ThemedSelect } from "./ThemedSelect";
import type { AutomationSchedule } from "../lib/tauri";

export function AutomationScheduleInput({
  schedule,
  provider,
  allowManual = true,
  onChange,
}: {
  schedule: AutomationSchedule;
  provider: "system" | "hermes";
  allowManual?: boolean;
  onChange: (schedule: AutomationSchedule) => void;
}) {
  const { t } = useTranslation();
  const mode =
    schedule.kind === "daily" && schedule.weekdays ? "weekdays" : schedule.kind;
  const changeMode = (mode: string) => {
    const schedule: AutomationSchedule =
      mode === "hourly"
        ? { kind: "hourly", minute: 15 }
        : mode === "interval"
          ? { kind: "interval", minutes: 60 }
          : mode === "manual"
            ? { kind: "manual" }
            : mode === "custom"
              ? { kind: "custom", expression: "0 9 * * 1-5" }
              : {
                  kind: "daily",
                  hour: 9,
                  minute: 0,
                  weekdays: mode === "weekdays",
                };
    onChange(schedule);
  };
  return (
    <div className="space-y-3">
      <label className="block space-y-2">
        <span className="text-[12px] font-medium text-muted">
          {t("automation.columns.schedule")}
        </span>
        <ThemedSelect
          aria-label={t("automation.columns.schedule")}
          value={mode}
          onChange={(e) => changeMode(e.target.value)}
          className="app-input w-full"
        >
          {[
            "weekdays",
            "daily",
            "hourly",
            "interval",
            ...(provider === "system"
              ? !allowManual
                ? []
                : ["manual"]
              : ["custom"]),
          ].map((value) => (
            <option key={value} value={value}>
              {t(`automation.schedules.${value}`)}
            </option>
          ))}
        </ThemedSelect>
      </label>
      {schedule.kind === "daily" && (
        <label className="block space-y-2">
          <span className="text-[12px] font-medium text-muted">
            {t("automation.localTime")}
          </span>
          <input
            type="time"
            required
            aria-label={t("automation.localTime")}
            value={`${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`}
            onChange={(e) => {
              const [hour, minute] = e.target.value.split(":").map(Number);
              onChange({ ...schedule, hour, minute });
            }}
            className="app-input w-full"
          />
        </label>
      )}
      {schedule.kind === "interval" && (
        <label className="block space-y-2">
          <span className="text-[12px] font-medium text-muted">
            {t("automation.intervalMinutes")}
          </span>
          <input
            type="number"
            min={1}
            max={525600}
            required
            aria-label={t("automation.intervalMinutes")}
            value={schedule.minutes}
            onChange={(e) =>
              onChange({ kind: "interval", minutes: Number(e.target.value) })
            }
            className="app-input w-full"
          />
        </label>
      )}
      {schedule.kind === "hourly" && (
        <label className="block space-y-2">
          <span className="text-[12px] font-medium text-muted">
            {t("automation.hourlyMinute")}
          </span>
          <input
            type="number"
            min={0}
            max={59}
            required
            value={schedule.minute}
            aria-label={t("automation.hourlyMinute")}
            onChange={(event) =>
              onChange({ kind: "hourly", minute: Number(event.target.value) })
            }
            className="app-input w-full"
          />
        </label>
      )}
      {schedule.kind === "custom" && (
        <label className="block space-y-2">
          <span className="text-[12px] font-medium text-muted">
            {t("automation.expression")}
          </span>
          <input
            required
            aria-label={t("automation.expression")}
            value={schedule.expression}
            onChange={(e) =>
              onChange({ kind: "custom", expression: e.target.value })
            }
            className="app-input w-full font-mono"
          />
        </label>
      )}
      <p className="text-[11px] leading-5 text-muted">
        {Intl.DateTimeFormat().resolvedOptions().timeZone}
      </p>
    </div>
  );
}
