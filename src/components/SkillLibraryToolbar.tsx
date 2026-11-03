import { useRef, type ReactNode } from "react";
import {
  LayoutGrid,
  List,
  RefreshCw,
  RotateCcw,
  Search,
  SquareCheck,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";

const focusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background";

interface ToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  backupStatus: ReactNode;
  checking: boolean;
  updating: boolean;
  updateCount: number;
  onCheckUpdates: () => void;
  onUpdate: () => void;
  children: ReactNode;
}

/** Search and maintenance actions sit above the library's browsing controls. */
export function SkillLibraryToolbar({
  search,
  onSearchChange,
  backupStatus,
  checking,
  updating,
  updateCount,
  onCheckUpdates,
  onUpdate,
  children,
}: ToolbarProps) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="relative min-w-0 basis-full sm:basis-80 sm:flex-1 sm:max-w-md">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label={t("mySkills.searchPlaceholder")}
            placeholder={t("mySkills.searchPlaceholder")}
            className="h-10 w-full rounded-lg border border-border-subtle bg-surface pl-9 pr-10 text-sm text-primary outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-bg [&::-webkit-search-cancel-button]:appearance-none"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {search && (
            <button
              type="button"
              aria-label={t("mySkills.clearSearch")}
              onClick={() => {
                onSearchChange("");
                searchRef.current?.focus();
              }}
              className={cn(
                "absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-primary",
                focusClass,
              )}
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {backupStatus}
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-border-subtle" />
          <button
            type="button"
            onClick={onCheckUpdates}
            disabled={checking}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50",
              focusClass,
            )}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(
                "h-3.5 w-3.5",
                checking && "animate-spin motion-reduce:animate-none",
              )}
            />
            {t("mySkills.updateActions.checkAll")}
          </button>
          <button
            type="button"
            onClick={onUpdate}
            disabled={updating || updateCount === 0}
            className={cn(
              "app-button-primary min-h-9 gap-2 rounded-lg px-3 disabled:border-border-subtle disabled:bg-surface disabled:text-muted",
              focusClass,
            )}
          >
            <RotateCcw
              aria-hidden="true"
              className={cn(
                "h-3.5 w-3.5",
                updating && "animate-spin motion-reduce:animate-none",
              )}
            />
            {t("mySkills.updateActions.updateAvailable", {
              count: updateCount,
            })}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

interface ViewControlsProps {
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  isMultiSelect: boolean;
  onToggleMultiSelect: () => void;
}

export function SkillLibraryViewControls({
  viewMode,
  onViewModeChange,
  isMultiSelect,
  onToggleMultiSelect,
}: ViewControlsProps) {
  const { t } = useTranslation();
  return (
    <>
      <div
        role="group"
        aria-label={t("mySkills.viewMode")}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-bg-secondary p-0.5"
      >
        {(["grid", "list"] as const).map((mode) => {
          const Icon = mode === "grid" ? LayoutGrid : List;
          return (
            <button
              key={mode}
              type="button"
              aria-label={t(`mySkills.${mode}View`)}
              title={t(`mySkills.${mode}View`)}
              aria-pressed={viewMode === mode}
              onClick={() => onViewModeChange(mode)}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                focusClass,
                viewMode === mode
                  ? "bg-surface-active text-primary"
                  : "text-muted hover:bg-surface-hover hover:text-primary",
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={isMultiSelect}
        onClick={onToggleMultiSelect}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors",
          focusClass,
          isMultiSelect
            ? "bg-accent-bg text-accent-light"
            : "text-secondary hover:bg-surface-hover",
        )}
      >
        <SquareCheck aria-hidden="true" className="h-3.5 w-3.5" />
        {t(isMultiSelect ? "mySkills.cancelSelect" : "mySkills.selectMode")}
      </button>
    </>
  );
}
