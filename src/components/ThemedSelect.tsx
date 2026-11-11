import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEventHandler,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import {
  optionsFrom,
  filterSelectOptions,
  positionFor,
  type SelectOption,
} from "../lib/themedSelect";
import { cn } from "../utils";
import {
  ThemedSelectSearch,
  type SelectSearchLabels,
} from "./ThemedSelectSearch";

type Props = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "multiple" | "size" | "onChange"
> & {
  leadingIcon?: ReactNode;
  /** Metadata that remains visible when the selected label is truncated. */
  valueBadge?: ReactNode;
  optionIcon?: (value: string) => ReactNode;
  /** A trailing marker shown after an option label in the open menu. */
  optionTrailing?: (value: string) => ReactNode;
  /** Position of the selected option marker in the custom menu. */
  checkPosition?: "start" | "after-label";
  /** A separate row action; invoking it does not change the selected value. */
  optionAction?: (value: string) =>
    | {
        label: string;
        icon: ReactNode;
        onSelect: () => void;
      }
    | undefined;
  /** A separated action rendered after all options in the open menu. */
  menuFooterAction?: {
    label: string;
    icon?: ReactNode;
    onSelect: () => void;
  };
  renderValue?: (value: string, label: string) => ReactNode;
  /** Let the menu fit complete labels and all rows when the viewport allows. */
  fitContent?: boolean;
  singleLineOptions?: boolean;
  menuTitle?: string;
  /** Search visible option labels without changing the selected value. */
  search?: SelectSearchLabels;
} & (
    | {
        multiple?: false;
        value: string;
        onChange?: ChangeEventHandler<HTMLSelectElement>;
      }
    | { multiple: true; value: string[]; onChange: (values: string[]) => void }
  );

/** A controlled, theme-aware select. Single selection retains the native change
 * contract; multiple selection toggles values and keeps the menu open. */
export function ThemedSelect(selection: Props) {
  const {
    value,
    children,
    className,
    leadingIcon,
    valueBadge,
    optionIcon,
    optionTrailing,
    checkPosition = "start",
    optionAction,
    menuFooterAction,
    renderValue,
    fitContent = false,
    singleLineOptions = false,
    menuTitle,
    search,
    multiple,
    ...props
  } = selection;
  const allOptions = optionsFrom(children);
  const [query, setQuery] = useState("");
  const options = filterSelectOptions(allOptions, query);
  const searchable = !!search;
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const native = useRef<HTMLSelectElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ value: "", time: 0 });
  const id = useId();
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [menuOverflow, setMenuOverflow] = useState(false);
  const open = position !== null;
  const values = typeof value === "string" ? [value] : value;
  const selected = allOptions.filter((option) => values.includes(option.value));
  const label = selected.map((option) => option.label).join(", ");
  // The footer has its separator and padding in addition to a normal row.
  // Include that extra space so a short menu does not acquire a needless rail.
  const rowCount =
    (search
      ? Math.min(8, Math.max(1, options.length)) + 1.25
      : options.length) +
    (menuTitle ? 1 : 0) +
    (menuFooterAction ? 1.25 : 0);
  const locate = () =>
    setPosition(
      positionFor(
        trigger.current,
        rowCount,
        fitContent,
        list.current,
        searchable ? 334 : undefined,
      ),
    );
  const show = () => {
    if (props.disabled || !allOptions.length) return;
    setQuery("");
    setPortalRoot(trigger.current?.closest("dialog") ?? document.body);
    setActive(
      Math.max(
        0,
        allOptions.findIndex(
          (option) => values.includes(option.value) && !option.disabled,
        ),
      ),
    );
    locate();
  };
  const choose = (option: SelectOption | undefined) => {
    if (!option || option.disabled) return;
    if (selection.multiple) {
      selection.onChange(
        values.includes(option.value)
          ? values.filter((value) => value !== option.value)
          : [...values, option.value],
      );
      (search ? searchInput.current : trigger.current)?.focus({
        preventScroll: true,
      });
      return;
    }
    if (native.current && option.value !== value) {
      native.current.value = option.value;
      native.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setPosition(null);
    trigger.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (open) searchInput.current?.focus({ preventScroll: true });
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !list.current?.contains(event.target)
      )
        setPosition(null);
    };
    const blur = () => setPosition(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      setPosition(null);
      trigger.current?.focus({ preventScroll: true });
    };
    const reposition = () =>
      setPosition(
        positionFor(
          trigger.current,
          rowCount,
          fitContent,
          list.current,
          searchable ? 334 : undefined,
        ),
      );
    reposition();
    // Other menu triggers may stop bubbling to keep the title bar from dragging.
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("mousedown", dismiss, true);
    document.addEventListener("click", dismiss, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("mousedown", dismiss, true);
      document.removeEventListener("click", dismiss, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, rowCount, fitContent, searchable]);
  useEffect(() => {
    if (open)
      list.current
        ?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);
  useLayoutEffect(() => {
    if (!open || !list.current) return;
    const overflow = list.current.scrollHeight > list.current.clientHeight + 1;
    setMenuOverflow((previous) =>
      previous === overflow ? previous : overflow,
    );
  }, [open, position?.height, rowCount]);
  const move = (direction: number) => {
    let next = active;
    for (let count = 0; count < options.length; count++) {
      next = (next + direction + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    setActive(next);
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (
      event.target === searchInput.current &&
      !["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)
    )
      return;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (!open) show();
      else move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (!open) show();
      setActive(
        event.key === "Home"
          ? Math.max(
              0,
              options.findIndex((option) => !option.disabled),
            )
          : Math.max(
              0,
              options.length -
                1 -
                [...options].reverse().findIndex((option) => !option.disabled),
            ),
      );
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) show();
      else choose(options[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setPosition(null);
    } else if (open && event.key === "ArrowRight" && optionAction) {
      event.preventDefault();
      list.current
        ?.querySelector<HTMLButtonElement>(`[data-option-action="${active}"]`)
        ?.focus();
    } else if (event.key === "Tab") {
      const action =
        open &&
        !event.shiftKey &&
        list.current?.querySelector<HTMLButtonElement>(
          `[data-option-action="${active}"]`,
        );
      const footer =
        open &&
        !event.shiftKey &&
        list.current?.querySelector<HTMLButtonElement>("[data-menu-footer]");
      if (action) {
        event.preventDefault();
        action.focus();
      } else if (footer) {
        event.preventDefault();
        footer.focus();
      } else {
        setPosition(null);
        if (event.target === searchInput.current)
          trigger.current?.focus({ preventScroll: true });
      }
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      const now = event.timeStamp;
      const query =
        (now - typeahead.current.time < 700 ? typeahead.current.value : "") +
        event.key.toLocaleLowerCase();
      typeahead.current = { value: query, time: now };
      const index = options.findIndex(
        (option) =>
          !option.disabled &&
          option.label.toLocaleLowerCase().startsWith(query),
      );
      if (index >= 0) {
        event.preventDefault();
        if (!open) show();
        setActive(index);
      }
    }
  };
  return (
    <div
      className={cn(
        "relative min-w-0",
        className?.includes("w-full") && "w-full",
      )}
    >
      <select
        {...props}
        ref={native}
        value={value}
        multiple={multiple}
        onChange={
          selection.multiple
            ? (event) =>
                selection.onChange(
                  [...event.target.selectedOptions].map(
                    (option) => option.value,
                  ),
                )
            : selection.onChange
        }
        hidden
        aria-hidden="true"
        tabIndex={-1}
      >
        {children}
      </select>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        aria-activedescendant={
          open && !search && options[active] ? `${id}-${active}` : undefined
        }
        disabled={props.disabled || !allOptions.length}
        title={props.title ?? (multiple ? label : undefined)}
        onClick={() => (open ? setPosition(null) : show())}
        onBlur={(event) => {
          if (!list.current?.contains(event.relatedTarget)) setPosition(null);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "app-input inline-flex w-full items-center justify-between gap-3 text-left hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {leadingIcon}
        <span className="min-w-0 flex-1 truncate">
          {!multiple && selected[0] && renderValue
            ? renderValue(selected[0].value, selected[0].label)
            : label || props["aria-label"]}
        </span>
        {valueBadge}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted",
            open && "rotate-180",
          )}
        />
      </button>
      {position &&
        createPortal(
          <div
            ref={list}
            id={search ? undefined : id}
            role={search ? undefined : "listbox"}
            aria-multiselectable={!search ? multiple || undefined : undefined}
            aria-label={!search ? props["aria-label"] : undefined}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget) &&
                event.relatedTarget !== trigger.current
              )
                setPosition(null);
            }}
            style={{
              position: "fixed",
              left: position.left,
              top: position.top,
              width: fitContent ? "max-content" : position.width,
              minWidth: fitContent ? position.width : undefined,
              maxWidth: "calc(100vw / var(--app-scale) - 16px)",
              height: position.height,
              maxHeight: position.height,
            }}
            className={cn(
              "z-[100] rounded-lg border border-border bg-surface p-1 shadow-xl",
              menuOverflow ? "overflow-y-auto" : "overflow-hidden",
            )}
          >
            {search && (
              <ThemedSelectSearch
                inputRef={searchInput}
                labels={search}
                query={query}
                onQuery={(next) => {
                  setQuery(next);
                  setActive(
                    Math.max(
                      0,
                      filterSelectOptions(allOptions, next).findIndex(
                        (option) => !option.disabled,
                      ),
                    ),
                  );
                }}
                listId={id}
                activeId={options[active] ? `${id}-${active}` : undefined}
                onKeyDown={handleKeyDown}
              />
            )}
            <div
              id={search ? id : undefined}
              role={search ? "listbox" : undefined}
              aria-label={search ? props["aria-label"] : undefined}
              aria-multiselectable={search ? multiple || undefined : undefined}
            >
              {search && !options.length && (
                <p role="status" className="px-2 py-3 text-sm text-muted">
                  {search.noResults}
                </p>
              )}
              {menuTitle && (
                <div
                  role="presentation"
                  className="px-2 py-2 text-xs text-muted"
                >
                  {menuTitle}
                </div>
              )}
              {options.map((option, index) => {
                const action = optionAction?.(option.value);
                const selectedMark = values.includes(option.value) ? (
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                ) : null;
                return (
                  <div
                    key={option.value}
                    role="presentation"
                    onMouseEnter={() => {
                      if (!option.disabled) setActive(index);
                    }}
                    className={cn(
                      "group/option flex items-center rounded-md",
                      active === index && "bg-surface-hover",
                    )}
                  >
                    <button
                      type="button"
                      role="option"
                      title={
                        option.title ??
                        (singleLineOptions ? option.label : undefined)
                      }
                      aria-selected={values.includes(option.value)}
                      aria-disabled={option.disabled}
                      id={`${id}-${index}`}
                      data-option-index={index}
                      disabled={option.disabled}
                      tabIndex={-1}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(option)}
                      className={cn(
                        "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm leading-5 focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40",
                        values.includes(option.value)
                          ? "font-medium text-accent-light"
                          : "text-secondary",
                        values.includes(option.value) && "disabled:opacity-80",
                        search && "scroll-mt-10",
                      )}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {checkPosition === "start" && selectedMark}
                      </span>
                      {optionIcon?.(option.value)}
                      <span
                        className={cn(
                          "min-w-0",
                          singleLineOptions
                            ? "truncate whitespace-nowrap"
                            : "break-words",
                          fitContent &&
                            !singleLineOptions &&
                            "[overflow-wrap:anywhere]",
                        )}
                      >
                        {option.label}
                      </span>
                      {checkPosition === "after-label" && selectedMark && (
                        <span className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center">
                          {selectedMark}
                        </span>
                      )}
                      {optionTrailing?.(option.value)}
                    </button>
                    {action && (
                      <button
                        type="button"
                        data-option-action={index}
                        aria-label={action.label}
                        title={action.label}
                        disabled={option.disabled}
                        onFocus={() => setActive(index)}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowLeft") {
                            event.preventDefault();
                            trigger.current?.focus({ preventScroll: true });
                          }
                        }}
                        onClick={() => {
                          setPosition(null);
                          trigger.current?.focus({ preventScroll: true });
                          action.onSelect();
                        }}
                        className="app-button-ghost pointer-events-none mx-1 h-7 w-7 shrink-0 rounded p-1 text-muted opacity-0 group-hover/option:pointer-events-auto group-hover/option:opacity-100 hover:text-danger focus:pointer-events-auto focus:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {action.icon}
                      </button>
                    )}
                  </div>
                );
              })}
              {menuFooterAction && (
                <div className="mt-1 border-t border-border-subtle pt-1">
                  <button
                    type="button"
                    aria-label={menuFooterAction.label}
                    data-menu-footer
                    onMouseDown={(event) => event.preventDefault()}
                    onKeyDown={(event) => {
                      if (event.key === "Tab" && event.shiftKey) {
                        event.preventDefault();
                        trigger.current?.focus({ preventScroll: true });
                      }
                    }}
                    onClick={() => {
                      setPosition(null);
                      trigger.current?.focus({ preventScroll: true });
                      menuFooterAction.onSelect();
                    }}
                    className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-secondary hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {menuFooterAction.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {menuFooterAction.label}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>,
          portalRoot ?? document.body,
        )}
    </div>
  );
}
