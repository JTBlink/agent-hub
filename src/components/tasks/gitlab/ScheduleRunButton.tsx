import { Check, Loader2, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { runRepositorySchedule } from "../../../lib/repositoryScheduleApi";
import { taskFailure } from "../../../lib/taskBrowserApi";

export function ScheduleRunButton({
  bindingId,
  scheduleId,
  title,
  onAccepted,
}: {
  bindingId: string;
  scheduleId: number;
  title: string;
  onAccepted: () => void;
}) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);
  const run = async () => {
    if (locked.current) return;
    locked.current = true;
    setRunning(true);
    try {
      await runRepositorySchedule(bindingId, scheduleId);
      toast.success(t("schedules.runAccepted", { title }));
      if (!mounted.current) return;
      setSubmitted(true);
      onAccepted();
      // GitLab queues schedule creation asynchronously and permits one play/minute.
      timers.current.forEach(clearTimeout);
      timers.current = [
        setTimeout(onAccepted, 2000),
        setTimeout(onAccepted, 5000),
        setTimeout(() => {
          locked.current = false;
          setSubmitted(false);
        }, 60_000),
      ];
    } catch (error) {
      const failure = taskFailure(error);
      toast.error(
        ["network", "internal", "invalid_response"].includes(failure.kind)
          ? t("schedules.runUncertain")
          : t(`tasks.errors.${failure.kind}`, {
              defaultValue: failure.message,
            }),
      );
      locked.current = false;
    } finally {
      if (mounted.current) setRunning(false);
    }
  };
  const label = t(submitted ? "schedules.runSubmitted" : "schedules.runNow", {
    title,
  });
  const Icon = running ? Loader2 : submitted ? Check : Play;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-busy={running}
      disabled={running || submitted}
      className="app-button-ghost h-8 w-8 shrink-0 rounded-none p-0 disabled:opacity-50"
      onClick={() => void run()}
    >
      <Icon
        size={14}
        aria-hidden="true"
        className={running ? "animate-spin" : undefined}
      />
    </button>
  );
}
