import { FileTypeIcon } from "../FileTypeIcon";
import { MarkdownLink } from "../MarkdownLink";
import { useRef, useState, type ReactNode } from "react";
import { openSearchPanel } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, FileCode2, Eye, Search, WrapText } from "lucide-react";
import { VscodeButton } from "../VscodeButton";
import { MarkdownContent } from "../MarkdownContent";
import { cn } from "../../utils";
import type { FileReaderProps, ReaderFile, ReaderLocation } from "./types";
import { CodeEditor } from "./CodeEditor";
import { CopyPathButton } from "../CopyPathButton";

export function FileContent({
  file,
  location,
  onContentChange,
  onOpenInVscode,
  openInVscodeHint,
  maxLength,
  actions,
  toolbarContainer,
  localPath,
  onPreview,
  defaultSource = false,
  showOpenInVscode = true,
}: {
  file: ReaderFile;
  location?: ReaderLocation;
  actions?: ReactNode;
  /** Render controls in a host toolbar while retaining the file breadcrumb. */
  toolbarContainer?: HTMLElement | null;
  /** Resolved local path supplied by the host for its tooltip and copy action. */
  localPath?: string;
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
  const editor = useRef<EditorView | null>(null);
  const [previousLocation, setPreviousLocation] = useState(location);
  if (previousLocation !== location) {
    setPreviousLocation(location);
    if (location) setPreview(false);
  }
  const [openError, setOpenError] = useState<string | null>(null);
  const toolbar = (
    <div className="flex shrink-0 items-center gap-1">
      {actions}
      {showOpenInVscode && (
        <VscodeButton
          onOpen={onOpenInVscode ? () => onOpenInVscode(file.path) : undefined}
          title={
            openInVscodeHint ??
            t(
              onOpenInVscode
                ? "fileReader.openInVscodeHint"
                : "fileReader.noLocalFile",
            )
          }
          onError={setOpenError}
          iconOnly={toolbarContainer !== undefined}
          labelClassName="hidden sm:inline"
          variant="ghost"
          className="gap-1.5 px-2 py-1 text-xs"
        />
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
          title={`${t("fileReader.find")} (⌘/Ctrl+F)`}
          aria-label={t("fileReader.find")}
          onClick={() => editor.current && openSearchPanel(editor.current)}
          className="app-button-ghost p-1.5"
        >
          <Search aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
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
      {toolbarContainer && createPortal(toolbar, toolbarContainer)}
      <div className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-x-2 border-b border-border-subtle px-3 py-0.5">
        <nav
          title={localPath ?? file.path}
          aria-label={t("fileReader.filePath")}
          className="min-w-0 flex-1 overflow-x-auto text-xs text-muted"
        >
          <ol className="flex w-max min-w-full items-center">
            {file.path.split("/").map((part, index, parts) => (
              <li
                key={index}
                className="flex shrink-0 items-center"
                aria-current={index === parts.length - 1 ? "page" : undefined}
              >
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
                  className={cn(index === parts.length - 1 && "text-secondary")}
                >
                  {part}
                </span>
              </li>
            ))}
          </ol>
        </nav>
        {localPath && <CopyPathButton path={localPath} />}
        {toolbarContainer === undefined && toolbar}
      </div>
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
          onViewReady={(view) => {
            editor.current = view;
          }}
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
