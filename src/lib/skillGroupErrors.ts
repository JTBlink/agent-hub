import { getErrorKind, getErrorMessage } from "./error";

/** Ownership conflicts are skips; database, I/O and unknown errors are failures. */
export function summarizeSkillGroupErrors(errors: unknown[], fallback: string) {
  const groups: {
    kind: "conflict" | "failure";
    count: number;
    message: string;
  }[] = [];
  for (const error of errors) {
    const kind =
      getErrorKind(error) === "target_conflict" ? "conflict" : "failure";
    const group = groups.find((item) => item.kind === kind);
    if (group) group.count++;
    else
      groups.push({
        kind,
        count: 1,
        message: getErrorMessage(error, fallback),
      });
  }
  return groups;
}
