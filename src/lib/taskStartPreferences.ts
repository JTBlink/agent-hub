import type { TaskSkill } from "./taskPrompt";

export interface TaskStartPreferences {
  session: string;
  sourcePath: string;
  createNew: boolean;
  agentKind: string;
  skills: TaskSkill[];
  promptTemplate: string | null;
}

export const defaultTaskStartPreferences: TaskStartPreferences = {
  session: "",
  sourcePath: "",
  createNew: false,
  agentKind: "",
  skills: [],
  promptTemplate: null,
};
const key = (projectId: string) =>
  `agent-hub.taskStart:${encodeURIComponent(projectId)}`;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function skill(value: unknown): value is TaskSkill {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.entryPath === "string" &&
    (value.source === "project" || value.source === "library")
  );
}

/** Per-project reusable options only; issue content, branch names and Agent identities remain transient. */
export function readTaskStartPreferences(
  projectId: string,
): TaskStartPreferences {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(key(projectId)) ?? "null",
    );
    if (!record(value) || value.version !== 1)
      return { ...defaultTaskStartPreferences };
    return {
      session: typeof value.session === "string" ? value.session : "",
      sourcePath: typeof value.sourcePath === "string" ? value.sourcePath : "",
      createNew: value.createNew === true,
      agentKind: typeof value.agentKind === "string" ? value.agentKind : "",
      promptTemplate:
        typeof value.promptTemplate === "string" ? value.promptTemplate : null,
      skills: Array.isArray(value.skills)
        ? value.skills.filter(skill).slice(0, 100)
        : [],
    };
  } catch {
    return { ...defaultTaskStartPreferences };
  }
}

export function saveTaskStartPreferences(
  projectId: string,
  preferences: TaskStartPreferences,
): boolean {
  try {
    const {
      session,
      sourcePath,
      createNew,
      agentKind,
      promptTemplate,
      skills,
    } = preferences;
    localStorage.setItem(
      key(projectId),
      JSON.stringify({
        version: 1,
        session,
        sourcePath,
        createNew,
        agentKind,
        promptTemplate,
        skills: skills.map(({ id, name, entryPath, source }) => ({
          id,
          name,
          entryPath,
          source,
        })),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
