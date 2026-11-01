import type { ManagedSkill, ProjectSkill } from "./tauri";

export interface TaskSkill {
  id: string;
  name: string;
  entryPath: string;
  source: "library" | "project";
  description?: string | null;
}

function entryPath(directory: string): string {
  const path = directory.replace(/[\\/]+$/, "");
  if (/(^|[\\/])SKILL\.md$/.test(path)) return path;
  return `${path}${path.includes("\\") && !path.includes("/") ? "\\" : "/"}SKILL.md`;
}

/** Keep source identity and the exact entry file, including same-name variants. */
export function taskSkillOptions(
  library: ManagedSkill[],
  project: ProjectSkill[],
): TaskSkill[] {
  const options: TaskSkill[] = [
    ...project
      .filter((skill) => skill.enabled && skill.path)
      .map((skill) => ({
        id: `project:${skill.agent}:${skill.relative_path || skill.dir_name}`,
        name: skill.name,
        description: skill.description,
        entryPath: entryPath(skill.path),
        source: "project" as const,
      })),
    ...library
      .filter((skill) => skill.central_path)
      .map((skill) => ({
        id: `library:${skill.id}`,
        name: skill.name,
        description: skill.description,
        entryPath: entryPath(skill.central_path),
        source: "library" as const,
      })),
  ];
  const paths = new Set<string>();
  return options
    .filter((skill) => {
      if (paths.has(skill.entryPath)) return false;
      paths.add(skill.entryPath);
      return true;
    })
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) || a.name.localeCompare(b.name),
    );
}

export function composeTaskPrompt(
  template: string,
  skills: TaskSkill[],
  context: string,
  labels: { skills: string; skillInstructions: string; task: string },
): string {
  return [
    template.trim(),
    ...(skills.length
      ? [
          `${labels.skills}\n${labels.skillInstructions}\n${skills.map((skill, index) => `${index + 1}. ${JSON.stringify(skill.name)}: ${JSON.stringify(skill.entryPath)}`).join("\n")}`,
        ]
      : []),
    context.trim() ? `${labels.task}\n${context.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
