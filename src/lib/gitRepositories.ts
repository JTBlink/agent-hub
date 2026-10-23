import type { GitSkillPreview, ManagedSkill } from "./tauri";

export const GIT_REPOSITORIES_SETTING = "git_install_repositories_v1";

export interface GitRepository {
  id: string;
  kind: "remote" | "local";
  url: string;
  name: string;
  skills: GitSkillPreview[];
  refreshedAt: number | null;
}

export interface GitRepositoryLibrary {
  repositories: GitRepository[];
  activeId: string | null;
}

/** Conservative identity: host, protocol, port, path case and ref remain distinct. */
export function gitRepositoryIdentity(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) url = `https://github.com/${url}`;
  return url.replace(/\.git$/, "");
}

export function validGitRepositoryUrl(input: string): boolean {
  const url = input.trim();
  if (/\s/.test(url)) return false;
  if (/^git@[^/:]+:.+/.test(url)) return true;
  if (/^[\w-]+\/[\w.-]+$/.test(url)) return true;
  try {
    const parsed = new URL(url);
    return (
      ["https:", "http:", "ssh:"].includes(parsed.protocol) &&
      !!parsed.hostname &&
      parsed.pathname.length > 1 &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.password &&
      (parsed.protocol === "ssh:" || !parsed.username)
    );
  } catch {
    return false;
  }
}

export function createGitRepository(
  url: string,
  name = "",
  kind: GitRepository["kind"] = "remote",
): GitRepository {
  const trimmed = url.trim();
  return {
    id:
      kind === "local"
        ? `local:${localSkillPath(trimmed, "")}`
        : gitRepositoryIdentity(trimmed),
    kind,
    url: trimmed,
    name:
      name.trim() ||
      trimmed
        .replace(/[\\/]+$/, "")
        .split(/[\\/:]/)
        .pop()
        ?.replace(/\.git$/, "") ||
      trimmed,
    skills: [],
    refreshedAt: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPreview(value: unknown): value is GitSkillPreview {
  return (
    isRecord(value) &&
    typeof value.rel_path === "string" &&
    typeof value.repo_path === "string" &&
    typeof value.name === "string" &&
    (value.description === null || typeof value.description === "string") &&
    (value.version === undefined ||
      value.version === null ||
      typeof value.version === "string")
  );
}

/** Reject corrupt settings instead of overwriting them with an empty library. */
export function parseGitRepositoryLibrary(
  raw: string | null,
): GitRepositoryLibrary {
  if (!raw) return { repositories: [], activeId: null };
  const data: unknown = JSON.parse(raw);
  if (!isRecord(data) || !Array.isArray(data.repositories))
    throw new Error("Invalid Git repository library");
  const repositories: GitRepository[] = [];
  for (const item of data.repositories) {
    if (
      !isRecord(item) ||
      (item.kind !== "remote" && item.kind !== "local") ||
      typeof item.url !== "string" ||
      !(item.kind === "remote"
        ? validGitRepositoryUrl(item.url)
        : item.kind === "local" &&
          /^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(item.url)) ||
      typeof item.name !== "string" ||
      !Array.isArray(item.skills) ||
      !item.skills.every(isPreview) ||
      !(item.refreshedAt === null || typeof item.refreshedAt === "number")
    ) {
      throw new Error("Invalid Git repository entry");
    }
    const repo = createGitRepository(item.url, item.name, item.kind);
    if (!repositories.some((existing) => existing.id === repo.id)) {
      repositories.push({
        ...repo,
        skills: item.skills,
        refreshedAt: item.refreshedAt,
      });
    }
  }
  const activeId = repositories.some((repo) => repo.id === data.activeId)
    ? String(data.activeId)
    : (repositories[0]?.id ?? null);
  return { repositories, activeId };
}

/** Match provenance and the exact repository-relative path, never the display name. */
export function installedGitSkill(
  repository: GitRepository,
  preview: GitSkillPreview,
  skills: ManagedSkill[],
): ManagedSkill | undefined {
  return skills.find((skill) => {
    if (repository.kind === "local") {
      return (
        localSkillPath(skill.central_path, "") ===
          localSkillPath(repository.url, preview.repo_path) ||
        (["local", "import"].includes(skill.source_type) &&
          !!skill.source_ref &&
          localSkillPath(skill.source_ref, "") ===
            localSkillPath(repository.url, preview.repo_path))
      );
    }
    const sameRepo = [skill.source_ref, skill.source_ref_resolved].some(
      (url) => url && gitRepositoryIdentity(url) === repository.id,
    );
    return (
      sameRepo &&
      (skill.source_subpath ?? "").replace(/\\/g, "/") === preview.repo_path
    );
  });
}

export interface GitSkillInstallation {
  skill: ManagedSkill;
  fromCurrentRepository: boolean;
}

/** Presence and provenance are separate: a same-name Skill may be installed from elsewhere. */
export function gitSkillInstallation(
  repository: GitRepository,
  preview: GitSkillPreview,
  skills: ManagedSkill[],
): GitSkillInstallation | undefined {
  const exact = installedGitSkill(repository, preview, skills);
  if (exact) return { skill: exact, fromCurrentRepository: true };
  const existing = skills.find(
    (skill) => skill.name.trim() === preview.name.trim(),
  );
  return existing
    ? { skill: existing, fromCurrentRepository: false }
    : undefined;
}

export function localSkillPath(root: string, path: string): string {
  return (
    [root.replace(/\\/g, "/").replace(/\/+$/, ""), path]
      .filter(Boolean)
      .join("/") || "/"
  );
}
