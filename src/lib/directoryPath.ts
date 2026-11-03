/** Display-only relative paths; filesystem operations still use backend path guards. */
export function relativeDirectoryPath(
  base: string | null | undefined,
  directory: string | null | undefined,
): string | null {
  const parse = (path: string | null | undefined) => {
    if (!path) return null;
    const normalized = path.startsWith("/") ? path : path.replace(/\\/g, "/");
    const match = /^(?:([a-z]:)\/|(\/\/[^/]+\/[^/]+)(?:\/|$)|(\/))/i.exec(
      normalized,
    );
    if (!match) return null;
    const windows = Boolean(match[1] || match[2]);
    const root = match[1] ?? match[2] ?? match[3];
    const parts: string[] = [];
    for (const part of normalized.slice(match[0].length).split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    return { root, parts, windows };
  };
  const from = parse(base);
  const to = parse(directory);
  if (!from || !to || from.windows !== to.windows) return null;
  const same = (a: string, b: string) =>
    from.windows ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (!same(from.root, to.root)) return null;
  let shared = 0;
  while (
    shared < from.parts.length &&
    shared < to.parts.length &&
    same(from.parts[shared], to.parts[shared])
  )
    shared++;
  return (
    [
      ...Array<string>(from.parts.length - shared).fill(".."),
      ...to.parts.slice(shared),
    ].join(from.windows ? "\\" : "/") || "."
  );
}
