import { getErrorKind, getErrorMessage } from "./error";

export interface SkillGroupOperationError {
  skillName: string;
  agentKey: string;
  error: unknown;
}

export interface SkillGroupErrorNotice {
  kind: "conflict" | "failure";
  count: number;
  items: { skillName: string; agentKey: string; message: string }[];
}

/** Keep every affected skill and reason; only ownership conflicts are skips. */
export function summarizeSkillGroupErrors(
  errors: SkillGroupOperationError[],
  fallback: string,
): SkillGroupErrorNotice[] {
  const groups: SkillGroupErrorNotice[] = [];
  for (const { skillName, agentKey, error } of errors) {
    const kind =
      getErrorKind(error) === "target_conflict" ? "conflict" : "failure";
    const item = {
      skillName,
      agentKey,
      message: getErrorMessage(error, fallback),
    };
    const group = groups.find((entry) => entry.kind === kind);
    if (group) {
      group.count++;
      group.items.push(item);
    } else groups.push({ kind, count: 1, items: [item] });
  }
  return groups;
}
