import { useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { navigateMenu } from "../../lib/menuNavigation";
import { getAppScale } from "../../lib/textScale";
import { HerdrIcon } from "@app/herdr";
import type { AgentLaunchSchemes } from "../../lib/agentLaunchConfig";
import type { TerminalLaunchBackend } from "../../lib/terminalAgents";
import { useTranslation } from "react-i18next";

/** Stay inside the parent popup's DOM boundary, even when positioned beside it. */
export function TerminalLaunchSchemeMenu({
  id,
  anchor,
  label,
  config,
  focusFirst,
  onSelect,
  onBack,
  allowHerdr,
  disabled,
  herdrDisabled,
}: {
  id?: string;
  allowHerdr: boolean;
  disabled: boolean;
  herdrDisabled: boolean;
  anchor: HTMLElement | null;
  label: string;
  config: AgentLaunchSchemes;
  focusFirst: boolean;
  onSelect: (id: string, backend: TerminalLaunchBackend) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    const locate = () => {
      const menu = ref.current;
      if (!menu || !anchor) return;
      const row = anchor.getBoundingClientRect();
      const parent =
        anchor.closest('[role="dialog"]')?.getBoundingClientRect() ?? row;
      const box = menu.getBoundingClientRect();
      const scale = getAppScale();
      const left =
        parent.right + box.width <= innerWidth - 8
          ? parent.right - 1
          : parent.left - box.width + 1;
      setPosition({
        left: Math.max(8, Math.min(left, innerWidth - box.width - 8)) / scale,
        top:
          Math.max(8, Math.min(row.top, innerHeight - box.height - 8)) / scale,
      });
    };
    locate();
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    if (focusFirst)
      ref.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
    return () => {
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [anchor, config.items.length, focusFirst]);
  return (
    <div
      ref={ref}
      style={position}
      className="fixed z-[60] w-72 max-w-[calc(100vw/var(--app-scale)-16px)] max-h-[calc(100vh/var(--app-scale)-16px)] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl"
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "ArrowLeft") {
          event.preventDefault();
          event.stopPropagation();
          onBack();
          return;
        }
        const menu =
          event.currentTarget.querySelector<HTMLElement>('[role="menu"]');
        if (menu && navigateMenu(menu, event.key)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div id={id} role="menu" aria-label={t("terminal.launchSchemes")}>
        {config.items.map((group) => (
          <div key={group.id} className="relative flex items-center rounded-md">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={group.id === config.default_id}
              disabled={disabled || !group.instruction.trim()}
              title={`${t("terminal.new")} · ${label} · ${group.name}`}
              className={`flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pl-2 text-left text-sm text-secondary outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${allowHerdr ? "pr-11" : "pr-2"}`}
              onClick={() => onSelect(group.id, "terminal")}
            >
              <span className="min-w-0 flex-1 truncate">{group.name}</span>
              {group.id === config.default_id && (
                <Check
                  size={14}
                  className="shrink-0 text-accent"
                  aria-hidden="true"
                />
              )}
            </button>
            {allowHerdr && (
              <button
                type="button"
                role="menuitem"
                aria-label={`${t("terminal.openHerdr")} ${label} · ${group.name}`}
                title={`${t("terminal.openHerdr")} ${label} · ${group.name}`}
                disabled={
                  disabled || herdrDisabled || !group.instruction.trim()
                }
                className="app-button-ghost absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 p-0 text-muted outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
                onClick={() => onSelect(group.id, "herdr")}
              >
                <HerdrIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
