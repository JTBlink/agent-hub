/** A single missing, extra, or replaced character in a skill name. */
function differsByOneEdit(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (left.length > right.length) i++;
    else if (right.length > left.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (left.length - i) + (right.length - j) === 1;
}

/** Match visible skill text and tolerate one typo in a name segment. */
export function matchesSkillSearch(
  name: string,
  displayName: string,
  description: string | null,
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const names = [name, displayName].map((value) => value.toLocaleLowerCase());
  if (
    names.some((value) => value.includes(needle)) ||
    (description || "").toLocaleLowerCase().includes(needle)
  ) {
    return true;
  }
  if (needle.length < 4) return false;
  return names.some((value) =>
    [value, ...value.split(/[\s/_-]+/)].some((part) =>
      differsByOneEdit(part, needle),
    ),
  );
}
