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
      className="git-commit-form space-y-1.5 px-3 pb-2 pt-1"
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
        rows={1}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        className="block h-7 min-h-7 w-full resize-y rounded-sm border border-border bg-background px-2 py-1 text-xs text-primary placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!enabled || busy || !message.trim()}
        title={t("git.commitStagedHint")}
        className="app-button-primary flex h-7 w-full items-center justify-center gap-1.5 rounded-sm py-0 text-xs"
      >
        {committing ? (
          <LoaderCircle size={14} className="animate-spin" />
        ) : (
          <Check size={14} />
        )}
        {t("git.commit")}
      </button>
    </form>
  );
}
