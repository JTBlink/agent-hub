import { useEffect, useId, useRef, useState } from "react";

import type { InstalledSkill } from "../lib/backend";

export type AgentSkillOption = {
  id: InstalledSkill["agent"];
  name: string;
  tone: string;
  mark: string;
  count: number;
};

export function AgentSkillSwitcher({
  options,
  selectedAgent,
  onChange,
}: {
  options: AgentSkillOption[];
  selectedAgent: InstalledSkill["agent"];
  onChange: (agent: InstalledSkill["agent"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selected =
    options.find((option) => option.id === selectedAgent) ?? options[0];

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
    const items = rootRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="option"]',
    );
    if (!items?.length) return;
    items[Math.max(0, Math.min(index, items.length - 1))]?.focus();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      window.requestAnimationFrame(() => {
        focusOption(Math.max(0, options.findIndex((option) => option.id === selected?.id)));
      });
    }
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = rootRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="option"]',
    );
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
        onChange(option.id);
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
  }

  if (!selected) return null;

  return (
    <div className="skill-agent-switcher" ref={rootRef}>
      <div className="skill-agent-switcher-heading">
        <span className="skill-agent-switcher-kicker">Agent Skills</span>
        <span className="skill-agent-switcher-caption">选择要查看的 Agent</span>
      </div>
      <div className={`agent-picker ${open ? "is-open" : ""}`}>
        <button
          ref={triggerRef}
          className="agent-picker-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className={`agent-avatar small ${selected.tone}`} aria-hidden="true">
            {selected.mark}
          </span>
          <span className="agent-picker-current">
            <span>当前视图</span>
            <strong>{selected.name}</strong>
          </span>
          <span className="agent-picker-count">
            <strong>{selected.count}</strong>
            <span>个 Skill</span>
          </span>
          <svg
            className="agent-picker-chevron"
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
            className="agent-picker-menu"
            role="listbox"
            aria-label="选择 Agent"
            onKeyDown={handleMenuKeyDown}
          >
            <div className="agent-picker-menu-heading">
              <span>切换 Agent</span>
              <small>{options.length} 个可用</small>
            </div>
            <div className="agent-picker-options">
              {options.map((option) => {
                const isSelected = option.id === selected.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`agent-picker-option ${isSelected ? "is-selected" : ""}`}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                  >
                    <span className={`agent-avatar small ${option.tone}`} aria-hidden="true">
                      {option.mark}
                    </span>
                    <span className="agent-picker-option-copy">
                      <strong>{option.name}</strong>
                      <small>{option.count} 个 Skill</small>
                    </span>
                    {isSelected && (
                      <span className="agent-picker-option-check" aria-hidden="true">
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
    </div>
  );
}
