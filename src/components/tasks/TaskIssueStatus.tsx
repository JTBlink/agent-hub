import { useRef, useState } from "react";
import {
  ChevronDown,
  CircleCheck,
  CircleDot,
  Copy,
  Ban,
  ArrowLeft,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  updateRepositoryIssue,
  taskFailure,
  type IssueStateChange,
  type RepositoryTask,
} from "../../lib/taskBrowserApi";
import { CardActionMenu } from "../CardActionMenu";
import { TaskStatusBadge } from "./TaskStatusBadge";

export function TaskIssueStatus({
  task,
  items = [],
  onUpdated,
}: {
  task: RepositoryTask;
  items?: RepositoryTask[];
  onUpdated: (task: RepositoryTask) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [target, setTarget] = useState("");
  const open = task.state === "open" || task.state === "opened";
  const reason = task.metadata?.state_reason;
  const label = open
    ? t("tasks.open")
    : t(
        reason === "completed"
          ? "tasks.completed"
          : reason === "not_planned"
            ? "tasks.notPlanned"
            : reason === "duplicate"
              ? "tasks.duplicate"
              : "tasks.closed",
      );
  const change = async (change: IssueStateChange, close?: () => void) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await updateRepositoryIssue(task, change);
      onUpdated(updated);
      close?.();
    } catch (error) {
      setError(taskFailure(error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <CardActionMenu
        label={t("tasks.changeState", { number: task.number })}
        align="start"
        disabled={busy}
        triggerClassName="h-7 w-auto max-w-full gap-1 px-1 text-xs"
        triggerIcon={
          <>
            <TaskStatusBadge
              state={task.state}
              label={busy ? t("common.loading") : label}
            />
            <ChevronDown size={12} className="shrink-0" />
          </>
        }
        onOpenChange={(isOpen) => {
          if (!isOpen) setDuplicate(false);
        }}
        actions={[
          {
            key: "open",
            label: t("tasks.open"),
            icon: <CircleDot size={13} />,
            disabled: open || busy,
            onSelect: () => void change({ action: "open" }),
          },
          ...(task.provider === "github"
            ? [
                {
                  key: "completed",
                  label: t("tasks.closeCompleted"),
                  icon: <CircleCheck size={13} />,
                  disabled: busy || (!open && reason === "completed"),
                  onSelect: () => void change({ action: "completed" }),
                },
                {
                  key: "not_planned",
                  label: t("tasks.closeNotPlanned"),
                  icon: <Ban size={13} />,
                  disabled: busy || (!open && reason === "not_planned"),
                  onSelect: () => void change({ action: "not_planned" }),
                },
                {
                  key: "duplicate",
                  label: t("tasks.closeDuplicate"),
                  icon: <Copy size={13} />,
                  disabled: busy,
                  keepOpen: true,
                  onSelect: () => {
                    setDuplicate(true);
                    setTarget("");
                    setError("");
                  },
                },
              ]
            : [
                {
                  key: "closed",
                  label: t("tasks.closed"),
                  disabled: busy || !open,
                  onSelect: () => void change({ action: "closed" }),
                },
              ]),
        ]}
        renderContent={
          duplicate
            ? (close) => (
                <div className="w-64 max-w-full p-1 text-xs">
                  <button
                    type="button"
                    className="app-button-ghost mb-1 gap-1 text-xs"
                    onClick={() => setDuplicate(false)}
                  >
                    <ArrowLeft size={13} />
                    {t("tasks.closeDuplicate")}
                  </button>
                  <form
                    className="flex gap-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const number = Number(target);
                      if (
                        !/^\d+$/.test(target) ||
                        !Number.isSafeInteger(number) ||
                        number <= 0 ||
                        number === task.number
                      ) {
                        setError(t("tasks.duplicateTargetInvalid"));
                        return;
                      }
                      void change(
                        { action: "duplicate", duplicate_of: number },
                        close,
                      );
                    }}
                  >
                    <input
                      autoFocus
                      aria-label={t("tasks.duplicateTarget")}
                      className="app-input h-7 min-w-0 flex-1 text-xs"
                      placeholder={t("tasks.duplicateTarget")}
                      inputMode="numeric"
                      value={target}
                      disabled={busy}
                      onChange={(event) => setTarget(event.target.value)}
                    />
                    <button
                      className="app-button-secondary h-7 text-xs"
                      type="submit"
                      disabled={busy || !target}
                    >
                      {t("tasks.applyFilter")}
                    </button>
                  </form>
                  <div className="mt-1 flex max-h-60 flex-col gap-1 overflow-y-auto">
                    {items
                      .filter(
                        (item) =>
                          item.binding_id === task.binding_id &&
                          item.kind === "issue" &&
                          item.number !== task.number &&
                          `${item.number} ${item.title}`
                            .toLowerCase()
                            .includes(target.toLowerCase()),
                      )
                      .map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          disabled={busy}
                          className="app-button-ghost truncate text-left text-xs"
                          title={item.title}
                          onClick={() =>
                            void change(
                              {
                                action: "duplicate",
                                duplicate_of: item.number,
                              },
                              close,
                            )
                          }
                        >
                          #{item.number} {item.title}
                        </button>
                      ))}
                  </div>
                  {error && (
                    <p role="alert" className="mt-1 text-danger">
                      {error}
                    </p>
                  )}
                </div>
              )
            : undefined
        }
      />
      {error && !duplicate && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
