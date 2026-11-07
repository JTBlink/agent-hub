import { useState } from "react";
import { useTranslation } from "react-i18next";
import { taskPlatforms } from "@app/platforms";
import * as api from "../../lib/tauri";
import { AppDialog } from "../AppDialog";
import { ThemedSelect } from "../ThemedSelect";
import { SingleChoiceGroup } from "../SingleChoiceGroup";
import { PlatformAccountPanel } from "./PlatformAccountPanel";
import { usePlatformAccounts } from "./usePlatformAccounts";
import { accountContextKey as contextKey } from "./usePlatformAccountSummary";
/** Platform accounts are independent of the task filters and repository-connection editor. */
export function PlatformAccountsDialog({
  initialProvider,
  onChanged,
  onClose,
}: {
  initialProvider?: api.TaskProvider;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState(
    initialProvider ?? taskPlatforms[0]?.id,
  );
  const accounts = usePlatformAccounts();
  const [selection, setSelection] = useState("");
  const [busy, setBusy] = useState(false);
  const platform = taskPlatforms.find((platform) => platform.id === provider);
  const rank = { authenticated: 0, checking: 1, unavailable: 2, signed_out: 3 };
  const candidates = accounts.contexts
    .filter((entry) => entry.context.provider === provider)
    .sort((a, b) => rank[a.status] - rank[b.status]);
  const context =
    candidates.find((entry) => contextKey(entry.context) === selection)
      ?.context ?? candidates[0]?.context;
  // Keep the chosen source stable as the remaining login checks complete.
  if (!selection && context) setSelection(contextKey(context));
  const labelFor = (entry: (typeof candidates)[number]) => {
    const active = entry.accounts.find(
      (account) => account.active && account.authenticated,
    );
    const status = active
      ? `@${active.username}`
      : t(`accounts.siteStatus.${entry.status}`);
    return `${entry.context.host} · ${status}${entry.context.project_scoped && entry.context.label ? ` · ${entry.context.label}` : ""}`;
  };
  return (
    <AppDialog
      title={t("tasks.accounts")}
      busy={busy}
      onClose={onClose}
      closeOnBackdrop={false}
      keepOpenOnWindowFocus
    >
      <div
        className="mb-4 flex items-center gap-2 border-b border-border-subtle pb-3"
        inert={busy}
      >
        <SingleChoiceGroup
          label={t("tasks.provider")}
          value={provider ?? ""}
          onChange={(value) => {
            const next = taskPlatforms.find(
              (platform) => platform.id === value,
            );
            if (next) {
              setProvider(next.id);
              setSelection("");
            }
          }}
          options={taskPlatforms.map((platform) => ({
            value: platform.id,
            label: platform.label,
            icon: <platform.icon className="h-5 w-5" aria-hidden="true" />,
          }))}
        />
      </div>
      {accounts.error && (
        <p role="alert" className="mb-3 text-xs text-warning">
          {t("common.error")}{" "}
          <button
            type="button"
            className="app-button-ghost"
            onClick={accounts.refresh}
          >
            {t("common.retry")}
          </button>
        </p>
      )}
      {platform && context ? (
        <>
          <label className="mb-4 block space-y-1 text-xs text-secondary">
            <span>{t("accounts.site")}</span>
            <ThemedSelect
              value={contextKey(context)}
              disabled={busy}
              onChange={(event) => setSelection(event.target.value)}
            >
              {candidates.map((entry) => (
                <option
                  key={contextKey(entry.context)}
                  value={contextKey(entry.context)}
                >
                  {labelFor(entry)}
                </option>
              ))}
            </ThemedSelect>
          </label>
          <PlatformAccountPanel
            key={contextKey(context)}
            platform={platform}
            context={context}
            onBusy={setBusy}
            onChanged={async (target, values) => {
              if (target && values) accounts.updateContext(target, values);
              else accounts.refresh();
              if (target) setSelection(`${target.context_id}@${target.host}`);
              await onChanged();
            }}
            onForget={async () => {
              await api.forgetPlatformAccountHost({
                context_id: context.id,
                provider: context.provider,
                host: context.host,
              });
              accounts.refresh();
              setSelection("");
            }}
          />
        </>
      ) : (
        !accounts.error && (
          <p role="status" className="text-sm text-muted">
            {t("common.loading")}
          </p>
        )
      )}
    </AppDialog>
  );
}
