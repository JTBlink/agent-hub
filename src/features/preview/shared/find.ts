/** Find across rendered text nodes, including highlighted code, lists and tables. */
export function findInDocument(
  root: HTMLElement,
  query: string,
  previous: number,
  backwards: boolean,
) {
  const nodes: Text[] = [];
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  let node;
  while ((node = walker.nextNode())) if (node instanceof Text) nodes.push(node);
  const text = nodes
    .map((node) => node.data)
    .join("")
    .toLowerCase();
  const needle = query.toLowerCase();
  const positions: number[] = [];
  if (needle)
    for (let start = 0; positions.length < 10000;) {
      const index = text.indexOf(needle, start);
      if (index < 0) break;
      positions.push(index);
      start = index + needle.length;
    }
  const count = positions.length;
  if (!count) return { count: 0, index: -1 };
  const index =
    previous < 0
      ? backwards
        ? count - 1
        : 0
      : (previous + (backwards ? -1 : 1) + count) % count;
  const start = positions[index],
    end = start + needle.length;
  let offset = 0;
  const range = root.ownerDocument.createRange();
  for (const node of nodes) {
    const next = offset + node.length;
    if (start >= offset && start < next) range.setStart(node, start - offset);
    if (end > offset && end <= next) {
      range.setEnd(node, end - offset);
      break;
    }
    offset = next;
  }
  const selection = root.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  range.startContainer.parentElement?.scrollIntoView({ block: "center" });
  return { count, index };
}
