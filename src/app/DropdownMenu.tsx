import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

export type DropdownOption = {
  value: string;
  label: string;
  description?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
};

type DropdownMenuProps = {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  menuHeading?: ReactNode;
  menuCount?: ReactNode;
  triggerCaption?: ReactNode;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function DropdownMenu({
  options,
  value,
  onChange,
  ariaLabel,
  menuHeading,
  menuCount,
  triggerCaption,
  placeholder = "请选择",
  className = "",
  disabled = false,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function focusOption(index: number) {
    const items =
      rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!items?.length) return;
    const nextIndex = Math.max(0, Math.min(index, items.length - 1));
    items[nextIndex]?.focus();
  }

  function openMenu() {
    setOpen(true);
    window.requestAnimationFrame(() => {
      focusOption(
        Math.max(
          0,
          options.findIndex((option) => option.value === value),
        ),
      );
    });
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      if (!open) openMenu();
    }
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items =
      rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!items?.length) return;
    const currentIndex = Array.from(items).findIndex(
      (item) => item === document.activeElement,
    );
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(currentIndex <= 0 ? items.length - 1 : currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(items.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[currentIndex];
      if (option) {
        onChange(option.value);
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
  }

  function selectOption(option: DropdownOption) {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className={`dropdown-menu ${className}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
        className={`dropdown-menu-trigger ${open ? "is-open" : ""}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        disabled={disabled || options.length === 0}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        {selected?.leading && (
          <span className="dropdown-menu-leading" aria-hidden="true">
            {selected.leading}
          </span>
        )}
        <span className="dropdown-menu-current">
          {triggerCaption && <span>{triggerCaption}</span>}
          <strong>{selected?.label ?? placeholder}</strong>
        </span>
        {(selected?.meta || menuCount) && (
          <span className="dropdown-menu-meta">
            <strong>{selected?.meta ?? menuCount}</strong>
          </span>
        )}
        <svg
          className="dropdown-menu-chevron"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          className="dropdown-menu-popover"
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleMenuKeyDown}
        >
          {(menuHeading || menuCount) && (
            <div className="dropdown-menu-heading">
              <span>{menuHeading ?? ariaLabel}</span>
              {menuCount && <small>{menuCount}</small>}
            </div>
          )}
          <div className="dropdown-menu-options">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`dropdown-menu-option ${isSelected ? "is-selected" : ""}`}
                  onClick={() => selectOption(option)}
                >
                  {option.leading && (
                    <span className="dropdown-menu-leading" aria-hidden="true">
                      {option.leading}
                    </span>
                  )}
                  <span className="dropdown-menu-option-copy">
                    <strong>{option.label}</strong>
                    {option.description && <small>{option.description}</small>}
                  </span>
                  {option.meta && (
                    <span className="dropdown-menu-option-meta">
                      {option.meta}
                    </span>
                  )}
                  {isSelected && (
                    <span
                      className="dropdown-menu-option-check"
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
