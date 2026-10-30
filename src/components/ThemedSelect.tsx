import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type OptionHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { getAppScale } from "../lib/textScale";
import { cn } from "../utils";

interface Option {
  value: string;
  label: string;
  disabled: boolean;
}
function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    if (child.type === Fragment) return optionsFrom(child.props.children);
    if (
      !isValidElement<OptionHTMLAttributes<HTMLOptionElement>>(child) ||
      child.type !== "option"
    )
      return [];
    const label =
      child.props.label ?? Children.toArray(child.props.children).join("");
    return [
      {
        value: String(child.props.value ?? label),
        label,
        disabled: !!child.props.disabled,
      },
    ];
  });
}

function positionFor(element: HTMLElement | null, count: number) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const scale = getAppScale();
  const widthLimit = window.innerWidth / scale;
  const heightLimit = window.innerHeight / scale;
  const below = heightLimit - rect.bottom / scale - 8;
  const above = rect.top / scale - 8;
  const desired = Math.min(256, count * 36 + 8);
  const upwards = below < desired && above > below;
  const height = Math.max(
    36,
    Math.min(desired, upwards ? above - 4 : below - 4),
  );
  const width = Math.min(Math.max(rect.width / scale, 180), widthLimit - 16);
  return {
    left: Math.max(8, Math.min(rect.left / scale, widthLimit - width - 8)),
    top: Math.max(
      8,
      upwards ? rect.top / scale - height - 4 : rect.bottom / scale + 4,
    ),
    width,
    height,
  };
}

/** A controlled, theme-aware single select. The hidden select retains form and
 * change-event compatibility; only the custom combobox is focusable or visible. */
export function ThemedSelect({
  value,
  children,
  className,
  leadingIcon,
  optionIcon,
  ...props
}: Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "multiple" | "size"
> & {
  value: string;
  leadingIcon?: ReactNode;
  optionIcon?: (value: string) => ReactNode;
}) {
  const options = optionsFrom(children);
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
  const typeahead = useRef({ value: "", time: 0 });
  const id = useId();
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const open = position !== null;
  const selected = options.find((option) => option.value === value);
  const locate = () =>
    setPosition(positionFor(trigger.current, options.length));
  const show = () => {
    if (props.disabled || !options.length) return;
    setPortalRoot(trigger.current?.closest("dialog") ?? document.body);
    setActive(
      Math.max(
        0,
        options.findIndex(
          (option) => option.value === value && !option.disabled,
        ),
      ),
    );
    locate();
  };
  const choose = (option: Option | undefined) => {
    if (!option || option.disabled) return;
    if (native.current && option.value !== value) {
      native.current.value = option.value;
      native.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setPosition(null);
    trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
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
    const reposition = () =>
      setPosition(positionFor(trigger.current, options.length));
    document.addEventListener("mousedown", dismiss);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, options.length]);
  useEffect(() => {
    if (open)
      list.current
        ?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);
  const move = (direction: number) => {
    let next = active;
    for (let count = 0; count < options.length; count++) {
      next = (next + direction + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    setActive(next);
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
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={props.disabled || !options.length}
        title={props.title}
        onClick={() => (open ? setPosition(null) : show())}
        onBlur={(event) => {
          if (!list.current?.contains(event.relatedTarget)) setPosition(null);
        }}
        onKeyDown={(event) => {
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
                      [...options]
                        .reverse()
                        .findIndex((option) => !option.disabled),
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
          } else if (event.key === "Tab") setPosition(null);
          else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            const now = Date.now();
            const query =
              (now - typeahead.current.time < 700
                ? typeahead.current.value
                : "") + event.key.toLocaleLowerCase();
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
        }}
        className={cn(
          "app-input inline-flex w-full items-center justify-between gap-3 text-left hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {leadingIcon}
        <span className="min-w-0 flex-1 truncate">
          {selected?.label ?? props["aria-label"]}
        </span>
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
            id={id}
            role="listbox"
            aria-label={props["aria-label"]}
            style={{
              position: "fixed",
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.height,
            }}
            className="z-[100] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl"
          >
            {options.map((option, index) => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled}
                id={`${id}-${index}`}
                key={option.value}
                data-option-index={index}
                disabled={option.disabled}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  if (!option.disabled) setActive(index);
                }}
                onClick={() => choose(option)}
                className={cn(
                  "flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] leading-5 focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40",
                  active === index && "bg-surface-hover",
                  option.value === value
                    ? "font-medium text-accent-light"
                    : "text-secondary",
                )}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {option.value === value && (
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                </span>
                {optionIcon?.(option.value)}
                <span className="min-w-0 break-words">{option.label}</span>
              </button>
            ))}
          </div>,
          portalRoot ?? document.body,
        )}
    </div>
  );
}
