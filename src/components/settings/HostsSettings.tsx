import { useState } from "react";
import {
  Check,
  CheckCheck,
  Copy,
  Code2,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HostsProfile } from "../../lib/hostsApi";
import { HostsPermissionGuide } from "./HostsPermissionGuide";
import { HostsProfileList } from "./HostsProfileList";
import { useHostsSettings } from "./useHostsSettings";
import { appliedHostsProfile, hostsDisplayPath } from "./hostsPresentation";
import { ConfirmDialog } from "../ConfirmDialog";
import { actionButtonClass, fieldClass } from "./settingsStyles";

type NameRequest = {
  mode: "new" | "copy" | "rename" | "system";
  content: string;
};
export function HostsSettings({ active }: { active: boolean }) {
  const { t, i18n } = useTranslation();
  const state = useHostsSettings(active);
  const [confirm, setConfirm] = useState<{
    message: string;
    action: () => void | Promise<boolean>;
  } | null>(null);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [name, setName] = useState("");
  const matched = appliedHostsProfile(state.profiles, state.system);
  const applied = !!state.profile && state.profile.id === matched?.id;
  const guard = (action: () => void | Promise<boolean>) => {
    if (state.dirty)
      setConfirm({ message: t("hosts.discardSelection"), action });
    else void action();
  };
  const select = (profile: HostsProfile | null) => {
    if ((profile?.id ?? null) === (state.profile?.id ?? null)) return;
    guard(() => state.select(profile));
  };
  const askName = (mode: NameRequest["mode"]) => {
    const show = () => {
      setName(
        mode === "rename"
          ? (state.profile?.name ?? "")
          : mode === "copy"
            ? t("hosts.copyName", { name: state.profile?.name })
            : "",
      );
      setNameRequest({
        mode,
        content:
          mode === "new"
            ? (state.system?.content ?? "127.0.0.1 localhost\n::1 localhost\n")
            : state.draft,
      });
    };
    if (mode === "new") guard(show);
    else show();
  };
  return (
    <section
      aria-labelledby="hosts-title"
      className="flex min-h-0 flex-col gap-3"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="hosts-title" className="app-section-title">
            {t("hosts.title")}
          </h2>
          <p id="hosts-help" className="mt-1 text-xs text-muted">
            {t("hosts.help")}
          </p>
        </div>
        <button
          type="button"
          disabled={state.busy}
          className="app-button-primary gap-1.5"
          onClick={() => askName("new")}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("hosts.newProfile")}
        </button>
      </header>
      <div className="app-panel flex flex-wrap items-center gap-3 bg-bg-secondary px-3 py-3">
        <Monitor className="h-5 w-5 shrink-0 text-accent-light" />
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold">{t("hosts.currentSystem")}</h3>
          <p className="mt-1 break-all text-[11px] text-muted">
            <span id="hosts-path-label" className="sr-only">
              {t("hosts.filePath")}
            </span>
            <code aria-labelledby="hosts-path-label">
              {state.system?.path ?? t("hosts.pathUnavailable")}
            </code>
          </p>
          <p className="mt-1 text-[11px] text-secondary">
            {matched
              ? t("hosts.matchesProfile", { name: matched.name })
              : t("hosts.unmatched")}
          </p>
        </div>
        <button
          type="button"
          disabled={state.busy || !state.system}
          className={actionButtonClass}
          onClick={() => select(null)}
        >
          {t("hosts.editSystem")}
        </button>
      </div>
      {state.error && (
        <div role="alert" className="space-y-2">
          <p className="whitespace-pre-wrap break-words text-xs text-danger">
            {state.error.message}
          </p>
          {state.error.permission && (
            <button
              type="button"
              className={actionButtonClass}
              disabled={state.busy}
              onClick={() => void state.retry()}
            >
              {t("hosts.permissions.retry")}
            </button>
          )}
        </div>
      )}
      {state.notice && (
        <p role="status" className="text-xs text-success">
          {state.notice}
        </p>
      )}
      {state.externalChange && (
        <p role="status" className="text-xs text-warning">
          {t("hosts.externalDraft")}
        </p>
      )}
      <div className="grid min-w-0 overflow-hidden rounded-md border border-border-subtle md:grid-cols-[200px_minmax(0,1fr)]">
        <HostsProfileList
          profiles={state.profiles}
          system={state.system}
          selected={state.profile?.id ?? null}
          busy={state.busy}
          onSelect={select}
          onCreate={() => askName("new")}
        />
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
            <div className="min-w-0">
              <p className="text-[10px] text-muted">
                {t(
                  state.profile
                    ? "hosts.completeProfile"
                    : "hosts.actualSystem",
                )}
              </p>
              <h3 className="mt-1 flex flex-wrap items-center gap-2 break-all text-sm font-semibold">
                {state.profile?.name ?? t("hosts.currentSystem")}
                {applied && (
                  <span className="inline-flex items-center gap-1 rounded bg-success-bg px-1.5 py-0.5 text-[10px] font-normal text-success">
                    <Check className="h-3 w-3" />
                    {t("hosts.currentlyApplied")}
                  </span>
                )}
              </h3>
            </div>
            <button
              type="button"
              className={actionButtonClass}
              disabled={state.busy || !state.source}
              onClick={() => void state.openDirectoryInVscode()}
            >
              <Code2 className="h-3.5 w-3.5" />
              {t("hosts.openDirectoryInVscode")}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border-subtle bg-bg-secondary px-3 py-2 text-[10px] text-muted">
            <code
              title={state.source?.path}
              aria-label={state.source?.path}
              tabIndex={state.source ? 0 : undefined}
              className="min-w-0 flex-1 truncate"
            >
              {state.source
                ? hostsDisplayPath(state.source.path)
                : t("hosts.pathUnavailable")}
            </code>
            <span className={`shrink-0 ${state.dirty ? "text-warning" : ""}`}>
              {t(state.dirty ? "hosts.unsaved" : "hosts.noChanges")}
            </span>
          </div>
          <textarea
            aria-label={t("hosts.editor")}
            aria-describedby="hosts-help"
            value={state.draft}
            disabled={state.busy || !state.source}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            onChange={(e) => state.setDraft(e.target.value)}
            className={`${fieldClass} min-h-72 w-full flex-1 resize-y rounded-none border-0 p-3 font-mono text-xs leading-relaxed focus-visible:ring-inset`}
          />
          <div className="flex flex-wrap justify-between gap-2 border-t border-border-subtle px-3 py-2 text-[10px] text-muted">
            <span>{t("hosts.syntax")}</span>
            <span>
              {state.profile
                ? t("hosts.saveHint")
                : state.readAt &&
                  t("hosts.readAt", {
                    time: new Intl.DateTimeFormat(i18n.language, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }).format(state.readAt),
                  })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle p-3">
            <button
              type="button"
              className={actionButtonClass}
              disabled={state.busy}
              onClick={() => guard(() => state.load(true))}
            >
              <RefreshCw
                className={`h-3 w-3 ${state.busy ? "animate-spin" : ""}`}
              />
              {t("hosts.reload")}
            </button>
            {state.profile ? (
              <>
                <button
                  type="button"
                  disabled={state.busy}
                  className={actionButtonClass}
                  onClick={() => askName("rename")}
                >
                  {t("hosts.rename")}
                </button>
                <button
                  type="button"
                  disabled={state.busy}
                  className={actionButtonClass}
                  onClick={() => askName("copy")}
                >
                  <Copy className="h-3 w-3" />
                  {t("hosts.copy")}
                </button>
                <button
                  type="button"
                  aria-label={t("hosts.delete")}
                  disabled={state.busy}
                  className="app-button-ghost text-danger"
                  onClick={() =>
                    setConfirm({
                      message: t("hosts.deleteConfirm", {
                        name: state.profile!.name,
                      }),
                      action: state.remove,
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={state.busy || !state.source}
                className={actionButtonClass}
                onClick={() => askName("system")}
              >
                <Plus className="h-3 w-3" />
                {t("hosts.saveAsProfile")}
              </button>
            )}
            <span className="flex-1" />
            <button
              type="button"
              className={
                state.profile ? actionButtonClass : "app-button-primary gap-1.5"
              }
              disabled={state.busy || !state.dirty}
              onClick={() => void state.save()}
            >
              <Save className="h-3 w-3" />
              {t(state.profile ? "hosts.saveProfile" : "common.save")}
            </button>
            {state.profile && (
              <button
                type="button"
                className="app-button-primary gap-1.5"
                disabled={state.busy || state.dirty || applied || !state.system}
                onClick={() => void state.apply(state.profile!)}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t(applied ? "hosts.alreadyApplied" : "hosts.apply")}
              </button>
            )}
          </div>
        </div>
      </div>
      {(!state.profile || state.error?.permission) && (
        <details
          open={state.error?.permission || undefined}
          className="text-xs"
        >
          <summary className="cursor-pointer text-muted">
            {t("hosts.permissions.title")}
          </summary>
          <div className="mt-2">
            <HostsPermissionGuide />
          </div>
        </details>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={t("hosts.confirmTitle")}
        message={confirm?.message ?? ""}
        tone="warning"
        confirmLabel={t("common.confirm")}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const result = await confirm?.action();
          return result === false ? false : undefined;
        }}
      >
        {state.error && (
          <p role="alert" className="text-xs text-danger">
            {state.error.message}
          </p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!nameRequest}
        title={t(
          nameRequest?.mode === "rename" ? "hosts.rename" : "hosts.newProfile",
        )}
        message={t("hosts.nameHint")}
        confirmLabel={t("common.save")}
        confirmDisabled={!name.trim() || state.busy}
        tone="warning"
        onClose={() => setNameRequest(null)}
        onConfirm={async () => {
          if (!nameRequest) return false;
          const ok = await (nameRequest.mode === "rename"
            ? state.rename(name)
            : state.create(name, nameRequest.content));
          return ok ? undefined : false;
        }}
      >
        <label className="block text-xs">
          {t("hosts.profileName")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className={`${fieldClass} mt-2 w-full`}
          />
        </label>
        {state.error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {state.error.message}
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}
