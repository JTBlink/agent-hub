import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

export function GitCommitForm({
  branch,
  enabled,
  busy,
  committing,
  onCommit,
}: {
  branch: string;
  enabled: boolean;
  busy: boolean;
  committing: boolean;
  onCommit: (message: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const submit = async () => {
    if (!enabled || busy || !message.trim()) return;
    if (await onCommit(message)) setMessage("");
  };
  return (
    <form
      className="git-commit-form space-y-2 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <textarea
        aria-label={t("git.commitMessage")}
        placeholder={t("git.commitPlaceholder", { branch })}
        value={message}
        disabled={busy}
        rows={2}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        className="block w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-xs text-primary placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!enabled || busy || !message.trim()}
        title={t("git.commitStagedHint")}
        className="app-button-primary flex w-full items-center justify-center gap-1.5 py-1.5 text-xs"
      >
        {committing ? (
          <LoaderCircle size={14} className="animate-spin" />
        ) : (
          <Check size={14} />
        )}
        {t("git.commit")}
      </button>
      <p className="text-xs text-muted">{t("git.commitStagedHint")}</p>
    </form>
  );
}
