import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  readSystemHosts,
  saveSystemHosts,
  type HostsSnapshot,
} from "../../lib/hostsApi";
import { getErrorMessage } from "../../lib/error";
import { HostsPermissionGuide } from "./HostsPermissionGuide";
import { ConfirmDialog } from "../ConfirmDialog";
import { actionButtonClass, fieldClass } from "./settingsStyles";

const editorText = (content: string) => content.replace(/\r\n/g, "\n");

export function HostsSettings({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<HostsSnapshot | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    message: string;
    permission: boolean;
  } | null>(null);
  const [backup, setBackup] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [discard, setDiscard] = useState(false);
  const pending = useRef(false);
  const attempted = useRef(false);
  const mounted = useRef(true);
  const dirty = snapshot !== null && content !== editorText(snapshot.content);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const describeError = useCallback(
    (cause: unknown) => {
      const message = getErrorMessage(cause, t("hosts.failed"));
      const line = message.match(/HOSTS_INVALID_LINE:(\d+)/)?.[1];
      if (line)
        return { message: t("hosts.invalidLine", { line }), permission: false };
      for (const [token, key] of [
        ["HOSTS_CONFLICT", "conflict"],
        ["HOSTS_ENCODING", "encoding"],
        ["HOSTS_TOO_LARGE", "tooLarge"],
      ]) {
        if (message.includes(token))
          return { message: t(`hosts.${key}`), permission: false };
      }
      const permission =
        /permission denied|access.*denied|not authori[sz]ed|authori[sz]ation|user cancel|cancell?ed|\(-128\)|\(-6000\d\)|\b740\b|\b1223\b|pkexec|polkit|拒绝访问|权限不足|取消|拒絕存取|權限不足/i.test(
          message,
        );
      return {
        message: t(
          permission ? "hosts.permissionFailed" : "hosts.failedDetails",
          { message },
        ),
        permission,
      };
    },
    [t],
  );

  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = await readSystemHosts();
      if (!mounted.current) return;
      setSnapshot(next);
      setContent(editorText(next.content));
    } catch (cause) {
      if (mounted.current) setError(describeError(cause));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [describeError]);

  useEffect(() => {
    if (!active || attempted.current) return;
    attempted.current = true;
    void load();
  }, [active, load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    if (!snapshot || !dirty || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await saveSystemHosts(content, snapshot.revision);
      if (!mounted.current) return;
      setSnapshot(result.snapshot);
      setContent(editorText(result.snapshot.content));
      setBackup(result.backup_path);
      setSaved(true);
    } catch (cause) {
      if (mounted.current) setError(describeError(cause));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="hosts-title"
      className="flex min-h-0 flex-col gap-3"
    >
      <div>
        <h2 id="hosts-title" className="app-section-title">
          {t("hosts.title")}
        </h2>
        <p id="hosts-help" className="mt-1 text-xs text-muted">
          {t("hosts.help")}
        </p>
      </div>
      <div
        className="app-panel space-y-1 px-3 py-2"
        aria-labelledby="hosts-path-label"
      >
        <h3
          id="hosts-path-label"
          className="text-xs font-semibold text-primary"
        >
          {t("hosts.filePath")}
        </h3>
        <code className="block break-all text-xs text-secondary">
          {snapshot?.path ?? t("hosts.pathUnavailable")}
        </code>
      </div>
      <HostsPermissionGuide />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && (
          <span className="mr-auto text-xs text-warning">
            {t("hosts.unsaved")}
          </span>
        )}
        <button
          type="button"
          className={actionButtonClass}
          disabled={busy}
          onClick={() => (dirty ? setDiscard(true) : void load())}
        >
          <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
          {t("hosts.reload")}
        </button>
        <button
          type="button"
          className="app-button-primary gap-1.5"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          <Save className="h-3 w-3" />
          {t(busy ? "hosts.working" : "common.save")}
        </button>
      </div>
      {error && (
        <div role="alert" className="space-y-2">
          <p className="whitespace-pre-wrap break-words text-xs text-danger">
            {error.message}
          </p>
          {error.permission && snapshot && dirty && (
            <button
              type="button"
              className={actionButtonClass}
              disabled={busy}
              onClick={() => void save()}
            >
              {t("hosts.permissions.retry")}
            </button>
          )}
        </div>
      )}
      {saved && (
        <p role="status" className="break-all text-xs text-success">
          {backup ? t("hosts.savedBackup", { path: backup }) : t("hosts.saved")}
        </p>
      )}
      <textarea
        aria-label={t("hosts.title")}
        aria-describedby="hosts-help"
        value={content}
        disabled={busy || !snapshot}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        onChange={(event) => {
          setContent(event.target.value);
          setSaved(false);
        }}
        className={`${fieldClass} min-h-80 w-full flex-1 resize-y p-3 font-mono text-sm leading-relaxed`}
      />
      <p className="text-xs text-muted">{t("hosts.syntax")}</p>
      <ConfirmDialog
        open={discard}
        title={t("hosts.reload")}
        tone="warning"
        message={t("hosts.discard")}
        confirmLabel={t("hosts.reload")}
        onClose={() => setDiscard(false)}
        onConfirm={async () => {
          await load();
        }}
      />
    </section>
  );
}
