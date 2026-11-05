import { useId, useState } from "react";
import { FileText, PanelLeft } from "lucide-react";
import { TabCloseButton } from "../TabCloseButton";
import { useTranslation } from "react-i18next";
import { FileTree } from "./FileTree";
import { FileContent } from "./FileContent";
import { cn } from "../../utils";
import type { FileReaderProps } from "./types";

/** Embeddable reader. Hosts supply text and own all I/O and persistence. */
export function FileReader({
  files,
  initialPath,
  directoryActions,
  onContentChange,
  onOpenInVscode,
  openInVscodeHint,
  maxLength,
}: FileReaderProps) {
  const { t } = useTranslation();
  const first = files.find((file) => file.path === initialPath) ?? files[0];
  const [selected, setSelected] = useState(first?.path);
  const [opened, setOpened] = useState<string[]>(first ? [first.path] : []);
  const [sidebar, setSidebar] = useState(true);
  const explorerId = useId();
  const file = files.find((file) => file.path === selected);
  const tabs = opened.filter((path) =>
    files.some((file) => file.path === path),
  );
  const select = (path: string) => {
    setSelected(path);
    setOpened((previous) =>
      previous.includes(path) ? previous : [...previous, path],
    );
  };
  const closeTab = (path: string) => {
    const next = tabs.filter((item) => item !== path);
    setOpened(next);
    if (selected === path)
      setSelected(next[Math.max(0, tabs.indexOf(path) - 1)]);
  };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <aside
        id={explorerId}
        hidden={!sidebar}
        aria-label={t("fileReader.explorer")}
        className="w-[32%] min-w-[110px] max-w-[280px] shrink-0 overflow-y-auto border-r border-border-subtle bg-bg-secondary p-2"
      >
        <div className="flex min-h-9 items-center justify-between gap-2 px-2 py-1">
          <h3 className="min-w-0 text-xs font-semibold text-muted">
            {t("fileReader.explorer")} · {files.length}
          </h3>
          {directoryActions}
        </div>
        <FileTree files={files} selected={file?.path} onSelect={select} />
      </aside>
      <section
        aria-label={t("fileReader.content")}
        className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
      >
        <div className="flex shrink-0 border-b border-border-subtle bg-bg-secondary">
          <button
            type="button"
            aria-label={t("fileReader.toggleExplorer")}
            title={t("fileReader.toggleExplorer")}
            aria-controls={explorerId}
            aria-expanded={sidebar}
            onClick={() => setSidebar(!sidebar)}
            className="app-button-ghost m-1 shrink-0 p-2"
          >
            <PanelLeft aria-hidden="true" className="h-4 w-4" />
          </button>
          <nav
            aria-label={t("fileReader.openFiles")}
            className="flex min-w-0 flex-1 overflow-x-auto"
          >
            {tabs.map((path) => (
              <div
                key={path}
                className={cn(
                  "flex max-w-[240px] shrink-0 items-center border-r border-border-subtle",
                  path === file?.path &&
                    "border-t-2 border-t-accent bg-surface",
                )}
              >
                <button
                  type="button"
                  title={path}
                  aria-label={t("fileReader.switchFile", { path })}
                  aria-pressed={path === file?.path}
                  onClick={() => select(path)}
                  className="flex min-w-0 items-center gap-2 px-3 py-2 text-xs text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <FileText
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-muted"
                  />
                  <span className="truncate">{path.split("/").at(-1)}</span>
                </button>
                <TabCloseButton
                  aria-label={t("fileReader.closeFile", { path })}
                  title={t("fileReader.closeFile", { path })}
                  onClick={() => closeTab(path)}
                />
              </div>
            ))}
          </nav>
        </div>
        {file ? (
          <FileContent
            key={file.path}
            file={file}
            onContentChange={onContentChange}
            onOpenInVscode={onOpenInVscode}
            showOpenInVscode={!directoryActions}
            openInVscodeHint={openInVscodeHint}
            maxLength={maxLength}
          />
        ) : (
          <div
            role="status"
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted"
          >
            <FileText aria-hidden="true" className="h-8 w-8" />
            {t(files.length ? "fileReader.selectFile" : "fileReader.empty")}
          </div>
        )}
      </section>
    </div>
  );
}
