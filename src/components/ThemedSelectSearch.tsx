import type { KeyboardEventHandler, RefObject } from "react";
import { Search, X } from "lucide-react";

export interface SelectSearchLabels {
  placeholder: string;
  clear: string;
  noResults: string;
}

export function ThemedSelectSearch({
  inputRef,
  labels,
  query,
  onQuery,
  listId,
  activeId,
  onKeyDown,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  labels: SelectSearchLabels;
  query: string;
  onQuery: (value: string) => void;
  listId: string;
  activeId?: string;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
}) {
  return (
    <div className="sticky top-0 z-10 bg-surface pb-1">
      <div className="flex items-center gap-1 rounded border border-border bg-bg-secondary px-2 focus-within:border-accent">
        <Search size={14} aria-hidden="true" className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label={labels.placeholder}
          placeholder={labels.placeholder}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-primary outline-none"
        />
        {query && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={labels.clear}
            title={labels.clear}
            className="app-button-ghost h-6 w-6 shrink-0 p-0"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onQuery("");
              inputRef.current?.focus();
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
