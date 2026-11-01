/** Synthetic search shares text with the preview editor; no real files are scanned. */
export function worktreeSearchFixture(
  command: string,
  raw: unknown,
  read: (path: string) => string,
  write: (path: string, content: string) => void,
) {
  if (command !== "search_worktree" && command !== "replace_worktree_matches")
    return { handled: false };
  const args = typeof raw === "object" && raw !== null ? raw : {};
  const options =
    "options" in args &&
    typeof args.options === "object" &&
    args.options !== null
      ? args.options
      : {};
  const query = "query" in options ? String(options.query) : "";
  const isRegex = "regex" in options && options.regex === true;
  let pattern = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if ("whole_word" in options && options.whole_word)
    pattern = `\\b(?:${pattern})\\b`;
  const regex = new RegExp(
    pattern,
    "gm" + ("case_sensitive" in options && options.case_sensitive ? "" : "i"),
  );
  if (command === "search_worktree") {
    const paths = [
      "README.md",
      "src/app.ts",
      "src/parser.rs",
      "src/styles.css",
      "package.json",
    ];
    const files = paths.flatMap((path) => {
      if (
        "include" in options &&
        options.include &&
        !path.startsWith(String(options.include).split("*")[0])
      )
        return [];
      if (
        "exclude" in options &&
        options.exclude &&
        path.startsWith(String(options.exclude).split("*")[0])
      )
        return [];
      const text = read(path);
      const matches = text.split("\n").flatMap((preview, index) =>
        [...preview.matchAll(regex)].map((match) => ({
          line: index + 1,
          column: match.index + 1,
          end_column: match.index + 1 + match[0].length,
          preview,
          preview_start: 1,
        })),
      );
      return matches.length ? [{ path, fingerprint: text, matches }] : [];
    });
    return {
      handled: true,
      value: {
        files,
        count: files.reduce((count, file) => count + file.matches.length, 0),
        truncated: false,
        skipped: 0,
      },
    };
  }
  let replaced = 0,
    files = 0;
  const errors: string[] = [];
  const entries =
    "files" in args && Array.isArray(args.files) ? args.files : [];
  const replacement = "replacement" in args ? String(args.replacement) : "";
  for (const file of entries) {
    if (read(file.path) !== file.fingerprint) {
      errors.push(`${file.path}: File changed on disk`);
      continue;
    }
    const content = read(file.path);
    replaced += [...content.matchAll(regex)].length;
    write(
      file.path,
      isRegex
        ? content.replace(regex, replacement)
        : content.replace(regex, () => replacement),
    );
    files++;
  }
  return { handled: true, value: { replaced, files, errors } };
}
