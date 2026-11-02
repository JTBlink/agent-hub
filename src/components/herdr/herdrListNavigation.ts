export function navigateHerdrList(e: React.KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
  const nodes = [
    ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
      "button[data-herdr-item]",
    ),
  ];
  const index = nodes.indexOf(
    document.activeElement instanceof HTMLButtonElement
      ? document.activeElement
      : nodes[0],
  );
  const next =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? nodes.length - 1
        : Math.max(
            0,
            Math.min(nodes.length - 1, index + (e.key === "ArrowUp" ? -1 : 1)),
          );
  e.preventDefault();
  nodes[next]?.focus();
}
