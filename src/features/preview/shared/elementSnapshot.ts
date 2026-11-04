export interface SnapshotElement {
  ref: string;
  tag: string;
  label: string;
  role: string;
  selector: string;
  disabled: boolean;
}
/** Page-controlled output only becomes UI rows after validating display fields. */
export function snapshotElements(value: unknown): SnapshotElement[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("elements" in value) ||
    !Array.isArray(value.elements)
  )
    return [];
  const candidates: unknown[] = value.elements;
  return candidates.slice(0, 500).flatMap((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("ref" in item) ||
      typeof item.ref !== "string" ||
      !("tag" in item) ||
      typeof item.tag !== "string"
    )
      return [];
    const string = (key: string) =>
      key in item && typeof Reflect.get(item, key) === "string"
        ? String(Reflect.get(item, key)).slice(0, 2000)
        : "";
    return [
      {
        ref: item.ref.slice(0, 100),
        tag: item.tag.slice(0, 40),
        label: string("label") || string("text"),
        role: string("role"),
        selector: string("selector"),
        disabled: "disabled" in item && item.disabled === true,
      },
    ];
  });
}
