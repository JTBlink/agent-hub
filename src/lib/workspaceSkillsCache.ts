import { getGlobalLocalSkills, type ProjectSkill } from "./tauri";

// Session-only filesystem snapshots shared by navigation, cards and group chips.
function createWorkspaceSkillsCache() {
  let snapshot: Record<string, ProjectSkill[]> = {};
  const listeners = new Set<() => void>();
  const requests = new Map<string, Promise<unknown>>();

  const load = (agent: string, refresh = false): Promise<unknown> => {
    const pending = requests.get(agent);
    if (pending && !refresh) return pending;
    const request = Promise.resolve()
      .then(() => getGlobalLocalSkills(agent))
      .then((skills) => {
        if (requests.get(agent) !== request) return;
        snapshot = { ...snapshot, [agent]: skills };
        listeners.forEach((listener) => listener());
      })
      .catch((error: unknown) => {
        // Failed scans retain the previous snapshot; unknown is not empty.
        if (requests.get(agent) === request) return error;
      })
      .finally(() => {
        if (requests.get(agent) === request) requests.delete(agent);
      });
    requests.set(agent, request);
    return request;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    async refreshLoaded() {
      await Promise.all(Object.keys(snapshot).map((agent) => load(agent)));
    },
    clear() {
      requests.clear();
      snapshot = {};
    },
  };
}

export const workspaceSkillsCache = createWorkspaceSkillsCache();
