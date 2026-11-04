import { FileTypeIcon } from "../FileTypeIcon";
import { MarkdownLink } from "../MarkdownLink";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  Code2,
  FileCode2,
  Eye,
  Loader2,
  WrapText,
} from "lucide-react";
import { getErrorMessage } from "../../lib/error";
import { MarkdownContent } from "../MarkdownContent";
import { cn } from "../../utils";
import type { FileReaderProps, ReaderFile, ReaderLocation } from "./types";
import { CodeEditor } from "./CodeEditor";

export function FileContent({
  file,
  location,
  onContentChange,
  onOpenInVscode,
  openInVscodeHint,
  maxLength,
  actions,
  toolbarContainer,
  onPreview,
  defaultSource = false,
  showOpenInVscode = true,
}: {
  file: ReaderFile;
  location?: ReaderLocation;
  actions?: ReactNode;
  /** Render controls in a host toolbar and omit the breadcrumb row. */
  toolbarContainer?: HTMLElement | null;
  defaultSource?: boolean;
  /** Open a workspace preview tab while retaining this source editor. */
  onPreview?: () => void;
  /** Project workspaces expose the external editor at the project level. */
  showOpenInVscode?: boolean;
} & Pick<
  FileReaderProps,
  "onContentChange" | "onOpenInVscode" | "openInVscodeHint" | "maxLength"
>) {
  const { t } = useTranslation();
  const markdown = /\.(md|markdown)$/i.test(file.path);
  const [preview, setPreview] = useState(
    markdown && !location && !defaultSource,
  );
  const [wrap, setWrap] = useState(false);
  useEffect(() => {
    if (location) setPreview(false);
  }, [location]);
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
  const toolbar = (
    <div className="flex shrink-0 items-center gap-1">
      {actions}
      {showOpenInVscode && (
        <button
          type="button"
          aria-label={t("install.scan.openInVscode")}
          title={
            openInVscodeHint ??
            t(
              onOpenInVscode
                ? "fileReader.openInVscodeHint"
                : "fileReader.noLocalFile",
            )
          }
          disabled={!onOpenInVscode || opening}
          aria-busy={opening}
          onClick={() => void openInVscode()}
          className="app-button-ghost gap-1.5 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent"
        >
          {opening ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Code2 aria-hidden="true" className="h-4 w-4" />
          )}
          <span
            className={
              toolbarContainer !== undefined ? "sr-only" : "hidden sm:inline"
            }
          >
            {t("install.scan.openInVscode")}
          </span>
        </button>
      )}
      {markdown &&
        (onPreview ? [true] : [false, true]).map((value) => (
          <button
            key={String(value)}
            type="button"
            aria-label={t(value ? "fileReader.preview" : "fileReader.source")}
            title={t(value ? "fileReader.preview" : "fileReader.source")}
            aria-pressed={onPreview ? undefined : preview === value}
            onClick={() =>
              value && onPreview ? onPreview() : setPreview(value)
            }
            className={cn(
              "app-button-ghost px-2 py-1 text-xs",
              !onPreview &&
                preview === value &&
                "bg-surface-active text-accent-light",
            )}
          >
            {toolbarContainer !== undefined ? (
              value ? (
                <Eye size={15} />
              ) : (
                <FileCode2 size={15} />
              )
            ) : (
              t(value ? "fileReader.preview" : "fileReader.source")
            )}
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
  );
  const lines = file.content.split("\n").length;
  return (
    <>
      {toolbarContainer !== undefined ? (
        toolbarContainer && createPortal(toolbar, toolbarContainer)
      ) : (
        <div className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-x-2 border-b border-border-subtle px-3 py-0.5">
          <div
            title={file.path}
            aria-label={file.path}
            className="flex min-w-0 flex-1 items-center overflow-hidden text-xs text-muted"
          >
            {file.path.split("/").map((part, index, parts) => (
              <span key={index} className="flex min-w-0 items-center">
                {index > 0 && (
                  <ChevronRight
                    aria-hidden="true"
                    size={12}
                    className="mx-1 shrink-0 text-faint"
                  />
                )}
                {index === parts.length - 1 && (
                  <FileTypeIcon path={file.path} size={13} className="mr-1.5" />
                )}
                <span
                  className={cn(
                    "truncate",
                    index === parts.length - 1 && "text-secondary",
                  )}
                >
                  {part}
                </span>
              </span>
            ))}
          </div>
          {toolbar}
        </div>
      )}
      {openError && (
        <p
          role="alert"
          className="shrink-0 break-words border-b border-border-subtle px-3 py-2 text-xs text-danger"
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
              a: ({ href, children }) => (
                <MarkdownLink href={href} webOnly>
                  {children}
                </MarkdownLink>
              ),
            }}
          />
        </div>
      ) : (
        <CodeEditor
          file={file}
          location={location}
          wrap={wrap}
          maxLength={maxLength}
          onChange={
            onContentChange
              ? (content) => onContentChange(file.path, content)
              : undefined
          }
        />
      )}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-bg-secondary px-3 py-1.5 text-xs text-muted">
        <span>
          {t(onContentChange ? "fileReader.editable" : "fileReader.readOnly")}
        </span>
        {openInVscodeHint && (
          <span className="min-w-0 flex-1">{openInVscodeHint}</span>
        )}
        <span>{t("fileReader.lines", { count: lines })} · UTF-8</span>
      </div>
    </>
  );
}
