/** Nested splits are independent of PTY ownership and preserve stable pane IDs. */
export type TerminalPaneLayout =
  | { pane: string }
  | { direction: "horizontal" | "vertical"; children: TerminalPaneLayout[] };

type Tab = {
  panes: string[];
  activePane: string;
  direction: "horizontal" | "vertical";
  layout?: TerminalPaneLayout;
};

export function readPaneLayout(
  value: unknown,
  panes: string[],
): TerminalPaneLayout | undefined {
  const found = new Set<string>();
  const parse = (
    input: unknown,
    depth: number,
  ): TerminalPaneLayout | undefined => {
    if (!input || typeof input !== "object" || depth > 8) return;
    if ("pane" in input) {
      const pane = input.pane;
      if (typeof pane !== "string" || !panes.includes(pane) || found.has(pane))
        return;
      found.add(pane);
      return { pane };
    }
    if (
      !("direction" in input) ||
      !("children" in input) ||
      (input.direction !== "horizontal" && input.direction !== "vertical") ||
      !Array.isArray(input.children) ||
      input.children.length < 2 ||
      input.children.length > 8
    )
      return;
    const children: TerminalPaneLayout[] = [];
    for (const child of input.children) {
      const parsed = parse(child, depth + 1);
      if (!parsed) return;
      children.push(parsed);
    }
    return { direction: input.direction, children };
  };
  const result = parse(value, 0);
  return found.size === panes.length ? result : undefined;
}

function layoutFor(tab: Tab): TerminalPaneLayout {
  return (
    readPaneLayout(tab.layout, tab.panes) ??
    (tab.panes.length === 1
      ? { pane: tab.panes[0] }
      : {
          direction: tab.direction,
          children: tab.panes.map((pane) => ({ pane })),
        })
  );
}

export function splitTerminalPane<T extends Tab>(
  tab: T,
  pane: string,
  direction: Tab["direction"],
): T {
  const index = tab.panes.indexOf(tab.activePane);
  if (index < 0 || tab.panes.includes(pane)) return tab;
  const split = (node: TerminalPaneLayout): TerminalPaneLayout =>
    "pane" in node
      ? node.pane === tab.activePane
        ? { direction, children: [node, { pane }] }
        : node
      : { ...node, children: node.children.map(split) };
  return {
    ...tab,
    layout: split(layoutFor(tab)),
    activePane: pane,
    panes: [
      ...tab.panes.slice(0, index + 1),
      pane,
      ...tab.panes.slice(index + 1),
    ],
  };
}

export function removeTerminalPane<T extends Tab>(tab: T, pane: string): T {
  const prune = (node: TerminalPaneLayout): TerminalPaneLayout | undefined => {
    if ("pane" in node) return node.pane === pane ? undefined : node;
    const children = node.children.flatMap((child) => {
      const result = prune(child);
      return result ? [result] : [];
    });
    return children.length === 1
      ? children[0]
      : children.length
        ? { ...node, children }
        : undefined;
  };
  const panes = tab.panes.filter((id) => id !== pane);
  return {
    ...tab,
    panes,
    layout: prune(layoutFor(tab)),
    activePane: panes.includes(tab.activePane) ? tab.activePane : panes[0],
  };
}

/** Percentage rectangles keep React pane siblings mounted when a leaf is split. */
export function terminalPaneBounds(
  tab: Tab,
): Record<
  string,
  { left: string; top: string; width: string; height: string }
> {
  const result: ReturnType<typeof terminalPaneBounds> = {};
  const visit = (
    node: TerminalPaneLayout,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    if ("pane" in node) {
      result[node.pane] = {
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
      };
      return;
    }
    node.children.forEach((child, index) => {
      const n = node.children.length;
      if (node.direction === "horizontal")
        visit(child, x + (width * index) / n, y, width / n, height);
      else visit(child, x, y + (height * index) / n, width, height / n);
    });
  };
  visit(layoutFor(tab), 0, 0, 100, 100);
  return result;
}
