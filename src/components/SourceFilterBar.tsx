import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";

interface SourceFilterBarProps {
  sources: string[];
  value: string;
  onChange: (source: string) => void;
  installedFilter: boolean;
  onInstalledFilterToggle: () => void;
}

export function SourceFilterBar({
  sources,
  value,
  onChange,
  installedFilter,
  onInstalledFilterToggle,
}: SourceFilterBarProps) {
  const { t } = useTranslation();

  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowSide, setOverflowSide] = useState<"left" | "right">("left");
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [visibleCount, setVisibleCount] = useState<number>(Infinity);

  const listRef = useRef<HTMLDivElement | null>(null);
  const overflowBtnRef = useRef<HTMLButtonElement | null>(null);
  const overflowPanelRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const allBtnRef = useRef<HTMLButtonElement | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const measureRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const resetOverflow = useCallback(() => {
    setOverflowOpen(false);
    setSearch("");
    setFocusedIndex(-1);
  }, []);

  const computeVisible = useCallback(() => {
    const container = containerRef.current;
    const allBtn = allBtnRef.current;
    const moreBtn = moreBtnRef.current;
    if (!container || !allBtn || !moreBtn) {
      setVisibleCount(Infinity);
      return;
    }

    const containerWidth = container.clientWidth;
    if (containerWidth <= 0) {
      setVisibleCount(Infinity);
      return;
    }

    const styles = window.getComputedStyle(container);
    const gap = parseFloat(styles.columnGap || styles.gap || "6") || 6;
    const available =
      containerWidth - allBtn.offsetWidth - gap - moreBtn.offsetWidth - gap;

    if (available <= 0) {
      setVisibleCount(0);
      return;
    }

    let used = 0;
    let count = 0;
    for (let i = 0; i < sources.length; i += 1) {
      const el = measureRefs.current[i];
      const w = el?.offsetWidth ?? 0;
      if (w <= 0) continue;
      const nextUsed = used + (count > 0 ? gap : 0) + w;
      if (nextUsed <= available) {
        used = nextUsed;
        count += 1;
      } else {
        break;
      }
    }
    setVisibleCount(count);
  }, [sources]);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- DOM measurement must run synchronously
    computeVisible();
  }, [computeVisible]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(computeVisible);
    observer.observe(container);
    return () => observer.disconnect();
  }, [computeVisible]);

  useEffect(() => {
    if (!overflowOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        overflowBtnRef.current?.contains(e.target as Node) ||
        overflowPanelRef.current?.contains(e.target as Node)
      )
        return;
      resetOverflow();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [resetOverflow, overflowOpen]);

  useEffect(() => {
    if (overflowOpen && visibleCount >= sources.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- close stale overflow when all sources fit
      resetOverflow();
    }
  }, [resetOverflow, sources.length, overflowOpen, visibleCount]);

  const overflowSources = sources.slice(visibleCount);
  const filteredOverflow = search
    ? overflowSources.filter((s) =>
        s.toLowerCase().includes(search.toLowerCase()),
      )
    : overflowSources;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clamp focused index when filtered list shrinks
    setFocusedIndex((idx) => {
      if (filteredOverflow.length === 0) return -1;
      if (idx < 0) return idx;
      return Math.min(idx, filteredOverflow.length - 1);
    });
  }, [filteredOverflow.length]);

  useEffect(() => {
    if (focusedIndex < 0) return;
    listRef.current?.children[focusedIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [focusedIndex]);

  if (sources.length === 0) return null;

  return (
    <div className="border-t border-border-subtle pt-2">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[13px] font-medium text-tertiary">
          {t("install.filters.source")}
        </span>
        <button
          type="button"
          onClick={onInstalledFilterToggle}
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 text-[13px] font-medium whitespace-nowrap transition-colors",
            installedFilter
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-border-subtle bg-background text-muted hover:text-secondary",
          )}
        >
          {t("install.filters.installed")}
        </button>
        <div ref={containerRef} className="relative min-w-0 flex-1">
          {/* Hidden measurement layer */}
          <div
            className="pointer-events-none invisible absolute left-0 top-0 flex h-0 items-center gap-1.5 overflow-hidden"
            aria-hidden="true"
          >
            <button
              ref={allBtnRef}
              tabIndex={-1}
              className="rounded-full border px-2.5 py-1 text-[13px] font-medium whitespace-nowrap"
            >
              {t("install.filters.allSources")}
            </button>
            {sources.map((source, i) => (
              <button
                key={source}
                ref={(el) => {
                  measureRefs.current[i] = el;
                }}
                tabIndex={-1}
                className="rounded-full border px-2.5 py-1 text-[13px] font-medium whitespace-nowrap"
              >
                @{source}
              </button>
            ))}
            <button
              ref={moreBtnRef}
              tabIndex={-1}
              className="flex items-center rounded-full border px-2 py-1"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Visible row */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChange("all")}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[13px] font-medium whitespace-nowrap transition-colors",
                value === "all"
                  ? "border-accent-border bg-accent-bg text-accent-light"
                  : "border-border-subtle bg-background text-muted hover:text-secondary",
              )}
            >
              {t("install.filters.allSources")}
            </button>
            {sources.slice(0, visibleCount).map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => onChange(source)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[13px] font-medium whitespace-nowrap transition-colors",
                  value === source
                    ? "border-accent-border bg-accent-bg text-accent-light"
                    : "border-border-subtle bg-background text-muted hover:text-secondary",
                )}
              >
                @{source}
              </button>
            ))}
            {visibleCount < sources.length && (
              <div className="relative">
                <button
                  ref={overflowBtnRef}
                  type="button"
                  onClick={() => {
                    if (overflowBtnRef.current) {
                      const rect =
                        overflowBtnRef.current.getBoundingClientRect();
                      setOverflowSide(
                        rect.left + 192 > window.innerWidth ? "right" : "left",
                      );
                    }
                    setOverflowOpen((v) => {
                      if (v) {
                        setSearch("");
                        setFocusedIndex(-1);
                      }
                      return !v;
                    });
                  }}
                  className={cn(
                    "flex items-center rounded-full border px-2 py-1 text-[13px] font-medium transition-colors",
                    overflowOpen
                      ? "border-accent-border bg-accent-bg text-accent-light"
                      : "border-border-subtle bg-background text-muted hover:text-secondary",
                  )}
                  title={`${sources.length - visibleCount} more`}
                  aria-expanded={overflowOpen}
                  aria-haspopup="listbox"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {overflowOpen && (
                  <div
                    ref={overflowPanelRef}
                    role="listbox"
                    className={cn(
                      "absolute top-full z-50 mt-1.5 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-lg",
                      overflowSide === "left" ? "left-0" : "right-0",
                    )}
                  >
                    <div className="border-b border-border-subtle px-2 py-1.5">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setFocusedIndex(-1);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              if (filteredOverflow.length === 0) return;
                              setFocusedIndex((i) =>
                                Math.min(i + 1, filteredOverflow.length - 1),
                              );
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              if (filteredOverflow.length === 0) return;
                              setFocusedIndex((i) => (i <= 0 ? 0 : i - 1));
                            } else if (
                              e.key === "Enter" &&
                              focusedIndex >= 0
                            ) {
                              const target = filteredOverflow[focusedIndex];
                              if (target) {
                                onChange(target);
                                resetOverflow();
                              }
                            } else if (e.key === "Escape") {
                              resetOverflow();
                            }
                          }}
                          placeholder={t("common.search")}
                          className="app-input w-full bg-background py-1 pl-6 pr-2 text-[12px]"
                          autoFocus
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                      </div>
                    </div>
                    <div
                      ref={listRef}
                      className="max-h-48 overflow-y-auto scrollbar-hide py-1"
                    >
                      {filteredOverflow.map((source, idx) => (
                        <button
                          key={source}
                          type="button"
                          role="option"
                          aria-selected={value === source}
                          onClick={() => {
                            onChange(source);
                            resetOverflow();
                          }}
                          className={cn(
                            "flex w-full items-center px-3 py-1.5 text-left text-[13px] transition-colors",
                            idx === focusedIndex
                              ? "bg-surface-hover text-primary"
                              : value === source
                                ? "bg-accent-bg text-accent-light"
                                : "text-secondary hover:bg-surface-hover",
                          )}
                        >
                          @{source}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
