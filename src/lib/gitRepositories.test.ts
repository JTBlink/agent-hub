import { describe, expect, it } from "vitest";
import { createManagedSkill } from "../../tests/fixtures/managedSkill";
import {
  createGitRepository,
  installedGitSkill,
  gitSkillInstallation,
  parseGitRepositoryLibrary,
  validGitRepositoryUrl,
} from "./gitRepositories";

const preview = {
  rel_path: "demo",
  repo_path: "skills/demo",
  name: "Demo",
  description: null,
};
const repo = createGitRepository(
  "ssh://git@git.example.invalid:11022/team/skills.git",
);

describe("Git repository library", () => {
  it("accepts supported remote transports and rejects embedded secrets and filesystem paths", () => {
    for (const url of [
      repo.url,
      "git@git.example.invalid:team/skills.git",
      "https://git.example.invalid/team/skills",
      "http://git.example.invalid:8080/team/skills.git",
      "team/skills",
    ])
      expect(validGitRepositoryUrl(url)).toBe(true);
    for (const url of [
      "/projects/demo",
      "file:///projects/demo",
      "ext::command",
      "https://secret@git.example.invalid/team/skills",
      "https://user:secret@git.example.invalid/team/skills",
      "https://git.example.invalid/team/skills?token=example",
      "../skills",
      "a/b c",
    ])
      expect(validGitRepositoryUrl(url)).toBe(false);
  });

  it("restores catalogs, deduplicates equivalent URLs and repairs an absent active selection", () => {
    const saved = { ...repo, skills: [preview], refreshedAt: 1 };
    const library = parseGitRepositoryLibrary(
      JSON.stringify({
        repositories: [
          saved,
          { ...saved, url: repo.url.replace(/\.git$/, "") },
        ],
        activeId: "removed",
      }),
    );
    expect(library.repositories).toHaveLength(1);
    expect(library.repositories[0].skills).toEqual([preview]);
    expect(library.activeId).toBe(repo.id);
  });

  it("never silently replaces corrupt or credential-bearing settings", () => {
    expect(() => parseGitRepositoryLibrary("broken")).toThrow();
    expect(() =>
      parseGitRepositoryLibrary(
        JSON.stringify({
          repositories: [
            { ...repo, url: "https://secret@git.example.invalid/team/skills" },
          ],
        }),
      ),
    ).toThrow();
    expect(parseGitRepositoryLibrary(null).repositories).toEqual([]);
    expect(() =>
      parseGitRepositoryLibrary(
        JSON.stringify({
          repositories: [
            { ...repo, skills: [{ ...preview, version: 3 }], refreshedAt: 1 },
          ],
          activeId: repo.id,
        }),
      ),
    ).toThrow();
  });

  it("matches exact repository and path even when names are changed or collide", () => {
    const installed = createManagedSkill({
      name: "Renamed",
      source_ref: repo.url,
      source_subpath: "skills/demo",
    });
    expect(installedGitSkill(repo, preview, [installed])?.id).toBe(
      installed.id,
    );
    expect(
      installedGitSkill(repo, preview, [
        { ...installed, source_subpath: "other/demo" },
      ]),
    ).toBeUndefined();
    expect(
      installedGitSkill(repo, preview, [
        {
          ...installed,
          source_ref: repo.url.replace("git.example", "other.example"),
        },
      ]),
    ).toBeUndefined();
    expect(
      installedGitSkill(repo, preview, [
        { ...installed, source_ref: repo.url.replace("team/", "Team/") },
      ]),
    ).toBeUndefined();
  });

  it("matches root skills and Windows repository-relative separators", () => {
    expect(
      installedGitSkill(repo, preview, [
        createManagedSkill({
          source_ref: repo.url,
          source_subpath: "skills\\demo",
        }),
      ]),
    ).toBeDefined();
    expect(
      installedGitSkill(repo, { ...preview, repo_path: "" }, [
        createManagedSkill({ source_ref: repo.url }),
      ]),
    ).toBeDefined();
  });

  it("restores local repositories and matches their local import provenance", () => {
    const local = createGitRepository("/projects/skills", "Team", "local");
    const restored = parseGitRepositoryLibrary(
      JSON.stringify({ repositories: [local], activeId: local.id }),
    );
    expect(restored.repositories[0].kind).toBe("local");
    expect(
      installedGitSkill(local, preview, [
        createManagedSkill({
          source_type: "local",
          source_ref: "/projects/skills/skills/demo",
        }),
      ]),
    ).toBeDefined();
    expect(
      installedGitSkill(local, preview, [
        createManagedSkill({
          source_type: "local",
          source_ref: "/projects/other/skills/demo",
        }),
      ]),
    ).toBeUndefined();
  });

  it("recognizes existing same-name Skills without claiming matching provenance or content", () => {
    const existing = createManagedSkill({
      name: preview.name,
      source_type: "local",
      source_ref: "/projects/other/demo",
    });
    expect(gitSkillInstallation(repo, preview, [existing])).toEqual({
      skill: existing,
      fromCurrentRepository: false,
    });
    expect(installedGitSkill(repo, preview, [existing])).toBeUndefined();
    expect(
      gitSkillInstallation(repo, { ...preview, name: "Another Skill" }, [
        existing,
      ]),
    ).toBeUndefined();
  });

  it("prefers exact provenance over a same-name Skill from another source", () => {
    const other = createManagedSkill({ id: "other", name: preview.name });
    const exact = createManagedSkill({
      id: "exact",
      name: "Renamed",
      source_ref: repo.url,
      source_subpath: preview.repo_path,
    });
    expect(gitSkillInstallation(repo, preview, [other, exact])).toEqual({
      skill: exact,
      fromCurrentRepository: true,
    });
  });

  it("recognizes legacy imports and library Skills registered directly inside a repository", () => {
    const local = createGitRepository("/projects/skills", "Team", "local");
    const path = "/projects/skills/skills/demo";
    const imported = createManagedSkill({
      source_type: "import",
      source_ref: path,
    });
    const registered = createManagedSkill({
      source_type: "shared",
      central_path: path,
    });
    expect(
      gitSkillInstallation(local, preview, [imported])?.fromCurrentRepository,
    ).toBe(true);
    expect(
      gitSkillInstallation(local, preview, [registered])?.fromCurrentRepository,
    ).toBe(true);
  });
});
