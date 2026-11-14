import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, GitBranch, Loader2, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CardActionMenu, type CardAction } from "../CardActionMenu";
import { getProjectGitReferences } from "../../lib/gitApi";
import { getErrorMessage } from "../../lib/error";

/** Branch selection executes immediately; creation only asks for a name. */
export function GitBranchMenu({
  projectId,
  worktreePath,
  current,
  label,
  disabled,
  triggerIcon,
  triggerClassName,
  className,
  onRun,
}: {
  projectId: string;
  worktreePath?: string;
  current: string;
  label: string;
  disabled?: boolean;
  triggerIcon: ReactNode;
  triggerClassName?: string;
  className?: string;
  onRun: (
    action: "switch_branch" | "create_branch",
    branch: string,
  ) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBranches(undefined);
    setError(undefined);
    setTruncated(false);
    void getProjectGitReferences(projectId, worktreePath).then(
      (data) => {
        if (cancelled) return;
        setBranches(
          data.entries
            .filter((entry) => entry.kind === "branches")
            .map((entry) => entry.name),
        );
        setTruncated(data.truncated);
      },
      (cause) => {
        if (!cancelled) setError(getErrorMessage(cause, t("common.error")));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, projectId, worktreePath, retry, t]);
  useEffect(() => {
    if (creating) input.current?.focus();
  }, [creating]);

  function finishCreating() {
    setCreating(false);
    setName("");
    // Restore focus after the menu trigger replaces the name field.
    requestAnimationFrame(() =>
      container.current?.querySelector("button")?.focus(),
    );
  }
  async function run(
    action: "switch_branch" | "create_branch",
    branch: string,
  ) {
    if (
      pending.current ||
      disabled ||
      !branch ||
      (action === "switch_branch" && branch === current)
    )
      return;
    pending.current = true;
    setBusy(true);
    try {
      if ((await onRun(action, branch)) && action === "create_branch")
        finishCreating();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const actions: CardAction[] = [
    {
      key: "create",
      label: t("git.actions.createBranch"),
      icon: <Plus size={14} />,
      onSelect: () => setCreating(true),
    },
    ...[
      current,
      ...(branches ?? []).filter((branch) => branch !== current),
    ].map((branch) => ({
      key: `branch:${branch}`,
      label: branch,
      icon:
        branch === current ? (
          <Check size={14} />
        ) : (
          <GitBranch size={14} aria-label={t("git.graph.localBranch")} />
        ),
      disabled: branch === current,
      onSelect: () => void run("switch_branch", branch),
    })),
  ];
  if (!branches)
    actions.push({
      key: "load",
      label: error ? `${error} · ${t("common.retry")}` : t("common.loading"),
      disabled: !error,
      keepOpen: true,
      onSelect: () => setRetry((value) => value + 1),
    });
  if (truncated)
    actions.push({
      key: "truncated",
      label: t("git.referencesTruncated"),
      disabled: true,
      onSelect: () => {},
    });

  return (
    <div ref={container} className={className}>
      {creating ? (
        <div className="flex min-w-0 items-center gap-1">
          <input
            ref={input}
            aria-label={t("git.actions.branchName")}
            placeholder={t("git.actions.branchName")}
            value={name}
            disabled={disabled || busy}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                void run("create_branch", name.trim());
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (!pending.current) finishCreating();
              }
            }}
            className="h-7 w-28 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs text-primary focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            aria-label={t("git.actions.createBranch")}
            title={t("git.actions.createBranch")}
            disabled={disabled || busy || !name.trim()}
            onClick={() => void run("create_branch", name.trim())}
            className="app-button-ghost h-6 w-6 shrink-0 p-0"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
          </button>
          <button
            type="button"
            aria-label={t("common.cancel")}
            title={t("common.cancel")}
            disabled={busy}
            onClick={finishCreating}
            className="app-button-ghost h-6 w-6 shrink-0 p-0"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <CardActionMenu
          label={label}
          disabled={disabled || busy}
          actions={actions}
          onOpenChange={setOpen}
          triggerIcon={
            busy ? <Loader2 size={14} className="animate-spin" /> : triggerIcon
          }
          triggerClassName={triggerClassName}
          className={className}
        />
      )}
    </div>
  );
}
