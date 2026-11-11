import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Check, ChevronRight } from "lucide-react";
import type { CardMenuAction } from "./CardActionMenu";
import { getAppScale } from "../lib/textScale";
import { cn } from "../utils";
import { menuButtons, navigateMenu } from "../lib/menuNavigation";

export function CardActionMenuItems({
  actions,
  close,
}: {
  actions: CardMenuAction[];
  close: () => void;
}) {
  const [active, setActive] = useState<string>();
  return actions.map((action) => (
    <Fragment key={action.key}>
      {action.separatorBefore && (
        <div role="separator" className="my-1 border-t border-border-subtle" />
      )}
      <CardActionMenuItem
        action={action}
        close={close}
        open={active === action.key}
        onOpen={(open) => setActive(open ? action.key : undefined)}
      />
    </Fragment>
  ));
}

function CardActionMenuItem({
  action,
  open,
  onOpen,
  close,
}: {
  action: CardMenuAction;
  open: boolean;
  onOpen: (open: boolean) => void;
  close: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false);
  const id = useId();
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const locate = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    const panel = menu.current?.getBoundingClientRect();
    if (!rect || !panel) return;
    const scale = getAppScale();
    const parent =
      trigger.current?.closest('[role="menu"]')?.getBoundingClientRect() ??
      rect;
    const left =
      parent.right + panel.width <= window.innerWidth - 8 * scale
        ? parent.right - 2 * scale
        : parent.left - panel.width + 2 * scale;
    setPos({
      left: Math.max(
        8,
        Math.min(left / scale, (window.innerWidth - panel.width) / scale - 8),
      ),
      top: Math.max(
        8,
        Math.min(
          rect.top / scale,
          (window.innerHeight - panel.height) / scale - 8,
        ),
      ),
    });
  }, []);
  const attachMenu = useCallback(
    (node: HTMLDivElement | null) => {
      menu.current = node;
      if (node) {
        locate();
        if (focusOnOpen.current) {
          focusOnOpen.current = false;
          menuButtons(node)[0]?.focus();
        }
      }
    },
    [locate],
  );
  useEffect(() => {
    if (!open) return;
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(locate);
    if (menu.current) observer?.observe(menu.current);
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [open, locate]);
  const focusMenu = () => {
    focusOnOpen.current = true;
    onOpen(true);
    if (menu.current) {
      focusOnOpen.current = false;
      menuButtons(menu.current)[0]?.focus();
    }
  };
  return (
    <div onMouseEnter={() => onOpen(!action.disabled && !!action.submenu)}>
      <button
        ref={trigger}
        type="button"
        role={action.checked === undefined ? "menuitem" : "menuitemradio"}
        aria-checked={action.checked}
        aria-haspopup={action.submenu ? "menu" : undefined}
        aria-expanded={action.submenu ? open : undefined}
        aria-controls={action.submenu && open ? id : undefined}
        disabled={action.disabled}
        title={action.label}
        onFocus={() => {
          if (!action.submenu) onOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" && action.submenu) {
            event.preventDefault();
            event.stopPropagation();
            focusMenu();
          } else if (
            open &&
            action.submenu &&
            (event.key === "Escape" || event.key === "ArrowLeft")
          ) {
            event.preventDefault();
            event.stopPropagation();
            onOpen(false);
          }
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (action.submenu) {
            focusMenu();
            return;
          }
          if (!action.keepOpen) close();
          action.onSelect?.();
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40",
          action.danger
            ? "text-danger hover:bg-danger-bg"
            : "text-secondary hover:bg-surface-hover",
        )}
      >
        {(action.icon || action.checked !== undefined) && (
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center opacity-70">
            {action.checked !== undefined ? (
              action.checked ? (
                <Check size={14} />
              ) : null
            ) : (
              action.icon
            )}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{action.label}</span>
        {action.shortcut && (
          <span aria-hidden="true" className="ml-4 shrink-0 text-xs text-muted">
            {action.shortcut}
          </span>
        )}
        {action.submenu && (
          <ChevronRight size={14} className="ml-auto shrink-0" />
        )}
      </button>
      {open && action.submenu && (
        <div
          ref={attachMenu}
          id={id}
          role="menu"
          aria-label={action.label}
          style={pos}
          className="fixed z-50 min-w-[156px] max-w-[calc(100vw/var(--app-scale)-16px)] max-h-[calc(100vh/var(--app-scale)-16px)] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape" || event.key === "ArrowLeft") {
              event.preventDefault();
              onOpen(false);
              trigger.current?.focus();
            } else if (event.key === "Tab") close();
            else if (navigateMenu(event.currentTarget, event.key))
              event.preventDefault();
          }}
        >
          <CardActionMenuItems actions={action.submenu} close={close} />
        </div>
      )}
    </div>
  );
}
