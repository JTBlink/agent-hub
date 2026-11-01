/** Keep three context lines around each change, retaining original source line numbers. */
export function collapseGitDiff(patch: string, context = 3): string {
  const output: string[] = [];
  const lines = patch.split(/\r?\n/);
  for (let index = 0; index < lines.length;) {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(lines[index]);
    if (!match) {
      output.push(lines[index++]);
      continue;
    }
    index++;
    let left = Number(match[1]);
    let right = Number(match[2]);
    const body: { text: string; left: number; right: number }[] = [];
    while (index < lines.length && /^[ +\-\\]/.test(lines[index])) {
      const text = lines[index++];
      body.push({ text, left, right });
      if (/^[ -]/.test(text)) left++;
      if (/^[ +]/.test(text)) right++;
    }
    const visible = new Set<number>();
    body.forEach(({ text }, position) => {
      if (!/^[+-]/.test(text)) return;
      for (
        let row = Math.max(0, position - context);
        row <= Math.min(body.length - 1, position + context);
        row++
      )
        visible.add(row);
    });
    for (let start = 0; start < body.length;) {
      if (!visible.has(start)) {
        start++;
        continue;
      }
      let end = start + 1;
      while (
        end < body.length &&
        (visible.has(end) || body[end].text.startsWith("\\"))
      )
        end++;
      const section = body.slice(start, end);
      const removed = section.filter(({ text }) => /^[ -]/.test(text)).length;
      const added = section.filter(({ text }) => /^[ +]/.test(text)).length;
      output.push(
        `@@ -${body[start].left},${removed} +${body[start].right},${added} @@`,
      );
      output.push(...section.map(({ text }) => text));
      start = end;
    }
  }
  return output.join("\n");
}
