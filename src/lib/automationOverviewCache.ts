import { getAutomationOverview, type AutomationOverview } from "./tauri";
import { getErrorMessage } from "./error";

interface Snapshot {
  data: AutomationOverview | null;
  loading: boolean;
  error: string | null;
  generation: number;
}

interface Entry {
  snapshot: Snapshot;
  request: Promise<void> | null;
  listeners: Set<() => void>;
}

// Session-only: task definitions and local paths are never written to web storage.
// Locale entries keep translated application names separate.
function createAutomationOverviewCache() {
  const entries = new Map<string, Entry>();
  const entryFor = (locale: string): Entry => {
    let entry = entries.get(locale);
    if (!entry) {
      entry = {
        snapshot: { data: null, loading: true, error: null, generation: 0 },
        request: null,
        listeners: new Set(),
      };
      entries.set(locale, entry);
    }
    return entry;
  };
  const publish = (entry: Entry, patch: Partial<Snapshot>) => {
    entry.snapshot = { ...entry.snapshot, ...patch };
    entry.listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: (locale: string) => entryFor(locale).snapshot,
    subscribe(locale: string, listener: () => void) {
      const entry = entryFor(locale);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    load(locale: string, refresh = false, background = true) {
      const entry = entryFor(locale);
      // Route switches, concurrent consumers and StrictMode share pending reads.
      // Explicit invalidation supersedes a read begun before a task mutation.
      if (entry.request && !refresh) return entry.request;
      publish(entry, {
        loading: !background || entry.snapshot.data === null,
        error: null,
        generation: entry.snapshot.generation + (refresh ? 1 : 0),
      });
      const request = Promise.resolve()
        .then(() => getAutomationOverview(locale))
        .then((data) => {
          if (entry.request === request) publish(entry, { data, error: null });
        })
        .catch((cause: unknown) => {
          if (entry.request === request)
            publish(entry, { error: getErrorMessage(cause, "") });
        })
        .finally(() => {
          if (entry.request === request) {
            entry.request = null;
            publish(entry, { loading: false });
          }
        });
      entry.request = request;
      return request;
    },
    clear() {
      // Also prevent a late response from publishing into a discarded entry.
      entries.forEach((entry) => {
        entry.request = null;
      });
      entries.clear();
    },
  };
}

export const automationOverviewCache = createAutomationOverviewCache();
