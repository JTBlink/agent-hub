import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Code2, Loader2, WrapText } from "lucide-react";
import { getErrorMessage } from "../../lib/error";
import { MarkdownContent } from "../MarkdownContent";
import { cn } from "../../utils";
import type { FileReaderProps, ReaderFile } from "./types";

export function FileContent({
  file,
  onContentChange,
  onOpenInVscode,
  maxLength,
}: {
  file: ReaderFile;
} & Pick<FileReaderProps, "onContentChange" | "onOpenInVscode" | "maxLength">) {
  const { t } = useTranslation();
  const markdown = /\.(md|markdown)$/i.test(file.path);
  const [preview, setPreview] = useState(markdown);
  const [wrap, setWrap] = useState(false);
  const gutter = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const openInVscode = async () => {
    if (!onOpenInVscode || pending.current) return;
    pending.current = true;
    setOpening(true);
    setOpenError(null);
    try {
      await onOpenInVscode(file.path);
    } catch (cause) {
      if (mounted.current)
        setOpenError(getErrorMessage(cause, t("common.error")));
    } finally {
      pending.current = false;
      if (mounted.current) setOpening(false);
    }
  };
  const lines = file.content.split("\n").length;
  return (
    <>
      <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-3 py-1.5">
        <span
          title={file.path}
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted"
        >
          {file.path}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={t("install.scan.openInVscode")}
            title={t(
              onOpenInVscode
                ? "fileReader.openInVscodeHint"
                : "fileReader.noLocalFile",
            )}
            disabled={!onOpenInVscode || opening}
            aria-busy={opening}
            onClick={() => void openInVscode()}
            className="app-button-ghost gap-1.5 px-2 py-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent"
          >
            {opening ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Code2 aria-hidden="true" className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {t("install.scan.openInVscode")}
            </span>
          </button>
          {markdown &&
            [false, true].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={preview === value}
                onClick={() => setPreview(value)}
                className={cn(
                  "app-button-ghost px-2 py-1 text-[12px]",
                  preview === value && "bg-surface-active text-accent-light",
                )}
              >
                {t(value ? "fileReader.preview" : "fileReader.source")}
              </button>
            ))}
          {!preview && (
            <button
              type="button"
              title={t("fileReader.wrap")}
              aria-label={t("fileReader.wrap")}
              aria-pressed={wrap}
              onClick={() => setWrap(!wrap)}
              className={cn(
                "app-button-ghost p-1.5",
                wrap && "bg-surface-active text-accent-light",
              )}
            >
              <WrapText aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {openError && (
        <p
          role="alert"
          className="shrink-0 break-words border-b border-border-subtle px-3 py-2 text-[12px] text-danger"
        >
          {openError}
        </p>
      )}
      {preview ? (
        <div
          tabIndex={0}
          aria-label={t("fileReader.preview")}
          className="min-h-0 flex-1 overflow-auto p-5 md:p-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <MarkdownContent
            content={file.content}
            components={{
              img: ({ alt }) => <span className="text-muted">{alt}</span>,
              a: ({ children }) => (
                <span className="text-accent-light underline">{children}</span>
              ),
            }}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-background font-mono text-[12px] leading-6">
          {!wrap && (
            <div
              aria-hidden="true"
              ref={gutter}
              className="shrink-0 select-none overflow-hidden border-r border-border-subtle px-3 py-4 text-right text-muted"
            >
              <pre>
                {Array.from({ length: lines }, (_, index) => index + 1).join(
                  "\n",
                )}
              </pre>
            </div>
          )}
          <textarea
            aria-label={file.path}
            readOnly={!onContentChange}
            value={file.content}
            maxLength={maxLength}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap={wrap ? "soft" : "off"}
            onChange={(event) =>
              onContentChange?.(file.path, event.target.value)
            }
            onScroll={(event) => {
              if (gutter.current)
                gutter.current.scrollTop = event.currentTarget.scrollTop;
            }}
            className="min-h-0 min-w-0 flex-1 resize-none overflow-auto bg-transparent p-4 font-mono text-[12px] leading-6 text-secondary outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
          />
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-bg-secondary px-3 py-1.5 text-[11px] text-muted">
        <span>
          {t(onContentChange ? "fileReader.editable" : "fileReader.readOnly")}
        </span>
        <span>{t("fileReader.lines", { count: lines })} · UTF-8</span>
      </div>
    </>
  );
}
