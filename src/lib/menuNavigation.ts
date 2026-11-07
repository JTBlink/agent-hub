/** Only navigate this level, excluding buttons in any open submenu. */
export function menuButtons(menu: HTMLElement) {
  return [
    ...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
  ].filter((button) => button.closest('[role="menu"]') === menu);
}

export function navigateMenu(menu: HTMLElement, key: string) {
  const items = menuButtons(menu);
  const index = items.findIndex((item) => item === document.activeElement);
  const next =
    key === "Home"
      ? 0
      : key === "End"
        ? items.length - 1
        : key === "ArrowDown"
          ? (index + 1) % items.length
          : key === "ArrowUp"
            ? (index - 1 + items.length) % items.length
            : null;
  if (next === null) return false;
  items[next]?.focus();
  return true;
}
