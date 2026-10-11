import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Layers } from "lucide-react";
import { cn } from "../utils";

interface Option {
  id: string;
  label: string;
}

/** Theme-aware group picker that keeps native popup chrome out of dialogs. */
export function SkillGroupSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = options.find((option) => option.id === value);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [open]);

  useEffect(() => {
    if (open)
      list.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const show = () => {
    setActiveIndex(
      Math.max(
        0,
        options.findIndex((option) => option.id === value),
      ),
    );
    setOpen(true);
  };
  const select = (option: Option) => {
    onChange(option.id);
    setOpen(false);
  };

  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget))
            setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) show();
            else
              setActiveIndex(
                (index) =>
                  (index +
                    (event.key === "ArrowDown" ? 1 : options.length - 1)) %
                  options.length,
              );
          } else if ((event.key === "Enter" || event.key === " ") && open) {
            event.preventDefault();
            const option = options[activeIndex];
            if (option) select(option);
          } else if (event.key === "Tab") setOpen(false);
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border bg-surface px-2.5 py-2 text-left text-[12px] font-medium text-secondary transition-colors hover:border-border hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          open ? "border-accent/50" : "border-border-subtle",
        )}
      >
        <Layers className="h-3.5 w-3.5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate" title={selected?.label}>
          {selected?.label ?? label}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl"
        >
          {options.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={option.id === value}
              id={`${id}-${index}`}
              key={option.id}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(option)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] transition-colors",
                option.id === value
                  ? "font-medium text-accent-light"
                  : "text-secondary",
                index === activeIndex && "bg-surface-hover",
              )}
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {option.id === value && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 truncate" title={option.label}>
                {option.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
