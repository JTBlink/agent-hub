import type {
  InstalledSkill,
  SkillSourceMetadata,
  SkillSourceRequest,
} from "./backend";

/** Build the same source request used by the original installation. */
export function buildSkillUpdateRequest(
  source: SkillSourceMetadata,
): SkillSourceRequest | undefined {
  switch (source.kind) {
    case "git":
    case "preset-git":
      return {
        kind: "git",
        url: source.locator,
        requestedRef: source.requestedRef,
        subdirectory: null,
      };
    case "skills-sh": {
      const locator = source.locator.replace(/^https:\/\/skills\.sh\//, "");
      return locator
        ? { kind: "skills-sh", ownerRepository: locator }
        : undefined;
    }
    case "local-directory":
      return { kind: "local-directory", path: source.locator };
    case "marketplace":
      return source.manifestPath
        ? { kind: "marketplace", manifest: source.manifestPath }
        : undefined;
  }
}

export function currentSkillVersion(skill: InstalledSkill): string {
  const version = skill.currentVersion?.trim();
  if (version) return version;
  const revision = skill.source.resolvedCommit?.trim();
  if (revision) return revision.slice(0, 12);
  const fingerprint = skill.installedFingerprint?.trim();
  if (fingerprint) return fingerprint.replace(/^sha256:/, "").slice(0, 12);
  return "未声明";
}

export function isSkillUpdateSupported(skill: InstalledSkill): boolean {
  return (
    skill.sourceTracked &&
    skill.storageKind !== "symlink" &&
    Boolean(buildSkillUpdateRequest(skill.source))
  );
}
