import type { SkillSourceRequest } from "./backend";

export type SkillSourceMode =
  "skills-sh" | "git" | "local-directory" | "marketplace";

export interface SkillSourceFormInput {
  mode: SkillSourceMode;
  locator: string;
  requestedRef?: string;
  subdirectory?: string;
}

export function buildSkillSourceRequest({
  mode,
  locator,
  requestedRef = "",
  subdirectory = "",
}: SkillSourceFormInput): SkillSourceRequest | undefined {
  const value = locator.trim();
  if (!value) return undefined;
  if (mode === "skills-sh") {
    return { kind: "skills-sh", ownerRepository: value };
  }
  if (mode === "local-directory") {
    return { kind: "local-directory", path: value };
  }
  if (mode === "marketplace") {
    return { kind: "marketplace", manifest: value };
  }
  return {
    kind: "git",
    url: value,
    requestedRef: requestedRef.trim() || null,
    subdirectory: subdirectory.trim() || null,
  };
}
