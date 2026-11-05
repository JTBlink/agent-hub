import { FileText, Folder, Globe, Paperclip, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardActionMenu } from "../../../components/CardActionMenu";
import type { ContextInput } from "../shared/contextFiles";
export interface ContextSource {
  id: string;
  title: string;
  description: string;
  kind: "file" | "page" | "folder";
  load: () => Promise<ContextInput>;
}
function SourceList({
  sources,
  onFiles,
  onChoose,
}: {
  sources: ContextSource[];
  onFiles: () => void;
  onChoose: (source: ContextSource) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const items = useRef<HTMLDivElement>(null);
  useEffect(() => {
    search.current?.focus();
  }, []);
  const matches = sources.filter((source) =>
    `${source.title} ${source.description}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <div
      className="preview-context-source-list"
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        if (
          (event.key === "Home" || event.key === "End") &&
          event.target === search.current
        )
          return;
        const buttons = Array.from(
          items.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
        );
        const index = buttons.findIndex(
          (button) => button === document.activeElement,
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : event.key === "ArrowDown"
                ? (index + 1) % buttons.length
                : index < 0
                  ? buttons.length - 1
                  : (index - 1 + buttons.length) % buttons.length;
        event.preventDefault();
        buttons[next]?.focus();
      }}
    >
      <label className="preview-context-search">
        <Search size={14} />
        <input
          ref={search}
          value={query}
          aria-label={t("preview.searchContext")}
          placeholder={t("preview.searchContext")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div ref={items} role="listbox" aria-label={t("preview.contextSources")}>
        <button
          type="button"
          role="option"
          aria-selected={false}
          data-context-source="files"
          onClick={onFiles}
        >
          <Paperclip size={15} />
          <span>{t("preview.filesAndImages")}</span>
        </button>
        {matches.map((source) => {
          const Icon =
            source.kind === "folder"
              ? Folder
              : source.kind === "page"
                ? Globe
                : FileText;
          return (
            <button
              key={source.id}
              type="button"
              role="option"
              aria-selected={false}
              title={source.description}
              data-context-source={source.id}
              onClick={() => onChoose(source)}
            >
              <Icon size={15} />
              <span>
                <strong>{source.title}</strong>
                <small>{source.description}</small>
              </span>
            </button>
          );
        })}
        {!matches.length && query && (
          <p className="text-xs text-muted">{t("preview.noContextMatches")}</p>
        )}
      </div>
    </div>
  );
}
export function ContextSourceMenu({
  disabled,
  sources,
  onFiles,
  onChoose,
}: {
  disabled: boolean;
  sources: ContextSource[];
  onFiles: () => void;
  onChoose: (source: ContextSource) => void;
}) {
  const { t } = useTranslation();
  return (
    <CardActionMenu
      label={t("preview.addContext")}
      className="preview-add-context"
      triggerIcon={<Plus size={16} />}
      align="start"
      disabled={disabled}
      actions={[]}
      renderContent={(close) => (
        <SourceList
          sources={sources}
          onFiles={() => {
            close();
            onFiles();
          }}
          onChoose={(source) => {
            close();
            onChoose(source);
          }}
        />
      )}
    />
  );
}
