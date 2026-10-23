import { compare, valid } from "semver";
import type { SkillSourceDiff } from "./tauri";

/** Match the Rust SemVer precedence contract; unknown versions imply no order. */
export function compareDeclaredSkillVersions(
  central: string | null | undefined,
  source: string | null | undefined,
): SkillSourceDiff["version_comparison"] {
  const parse = (value: string | null | undefined) =>
    value ? valid(value.trim().replace(/^v+/, "")) : null;
  const left = parse(central);
  const right = parse(source);
  if (!left || !right) return "unknown";
  const order = compare(left, right);
  return order > 0
    ? "central_newer"
    : order < 0
      ? "source_newer"
      : "same_version";
}
