import { useTranslation } from "react-i18next";
import { useSystemLoad } from "../../hooks/useSystemLoad";
import { diskCapacity, loadPercent, memoryPercent } from "../../lib/systemLoad";
import "../../styles/system-load.css";

const percentLabel = (value: number | null) =>
  value === null ? "—" : `${Math.round(value)}%`;

function severity(value: number, warning: number) {
  return value >= 90 ? "critical" : value >= warning ? "warning" : "normal";
}

export function SystemLoadStatus() {
  const { t } = useTranslation();
  const { snapshot, history, failed } = useSystemLoad();
  const cpu = loadPercent(snapshot?.cpu_percent);
  const memory = memoryPercent(snapshot);
  const available = diskCapacity(snapshot?.disk_available_bytes);
  const total = diskCapacity(snapshot?.disk_total_bytes);
  const diskLow =
    available !== null &&
    snapshot !== null &&
    snapshot.disk_available_bytes !== null &&
    snapshot.disk_available_bytes < 10 * 1024 ** 3;
  const diskTitle =
    failed || (snapshot && (available === null || total === null))
      ? t("systemLoad.diskUnavailable")
      : !snapshot
        ? t("systemLoad.sampling")
        : t(diskLow ? "systemLoad.diskLowSpace" : "systemLoad.disk", {
            available,
            total,
          });
  const cpuTitle = failed
    ? t("systemLoad.unavailable")
    : cpu === null
      ? t("systemLoad.sampling")
      : t("systemLoad.cpu", { percent: percentLabel(cpu) });
  const memoryTitle = failed
    ? t("systemLoad.unavailable")
    : memory === null || !snapshot
      ? t("systemLoad.sampling")
      : t("systemLoad.memory", {
          percent: percentLabel(memory),
          used: (snapshot.memory_used_bytes / 1024 ** 3).toFixed(1),
          total: (snapshot.memory_total_bytes / 1024 ** 3).toFixed(1),
        });

  return (
    <div
      className="system-load-status"
      role="group"
      aria-label={t("systemLoad.title")}
    >
      <span className="system-load-item" title={cpuTitle} aria-label={cpuTitle}>
        <span>CPU</span>
        <span className="system-load-history" aria-hidden="true">
          {Array.from({ length: 16 }, (_, index) => {
            const value = history[index - (16 - history.length)];
            return (
              <span
                key={index}
                className={`system-load-bar ${severity(value ?? 0, 75)}`}
                style={{
                  height: `${Math.max(10, value ?? 0)}%`,
                  opacity: value == null ? 0.25 : 1,
                }}
              />
            );
          })}
        </span>
        <span className="system-load-percent text-secondary">
          {percentLabel(cpu)}
        </span>
      </span>
      <span
        className="system-load-item"
        title={memoryTitle}
        aria-label={memoryTitle}
      >
        <span>MEM</span>
        <span className="system-load-meter" aria-hidden="true">
          <span
            className={`system-load-fill ${severity(memory ?? 0, 80)}`}
            style={{ width: `${memory ?? 0}%` }}
          />
        </span>
        <span className="system-load-percent text-secondary">
          {percentLabel(memory)}
        </span>
      </span>
      <span
        className={`system-load-item${diskLow ? " text-danger" : ""}`}
        title={diskTitle}
        aria-label={diskTitle}
      >
        <span>DISK</span>
        <span className={diskLow ? "text-danger" : "text-secondary"}>
          {available === null ? "—" : t("systemLoad.diskFree", { available })}
        </span>
      </span>
    </div>
  );
}
