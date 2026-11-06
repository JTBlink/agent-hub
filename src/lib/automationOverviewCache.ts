import { getAutomationOverview, type AutomationOverview } from "./tauri";
import { getErrorMessage } from "./error";
import {
  clearAutomationOverviewSummary,
  readAutomationOverviewSummary,
  saveAutomationOverviewSummary,
} from "./automationOverviewStorage";

const FRESH_MS = 15_000;

interface Snapshot {
  data: AutomationOverview | null;
  loading: boolean;
  error: string | null;
  generation: number;
  restored: boolean;
}

interface Entry {
  snapshot: Snapshot;
  request: Promise<void> | null;
  listeners: Set<() => void>;
  updatedAt: number;
  invalidated: boolean;
}

// Full details stay in memory. Persisted summaries are display-only until revalidated.
// Locale entries keep translated application names separate; focus/events bypass TTL.
function createAutomationOverviewCache() {
  const entries = new Map<string, Entry>();
  const entryFor = (locale: string): Entry => {
    let entry = entries.get(locale);
    if (!entry) {
      const data = readAutomationOverviewSummary(locale);
      entry = {
        snapshot: {
          data,
          loading: data === null,
          error: null,
          generation: 0,
          restored: data !== null,
        },
        request: null,
        listeners: new Set(),
        updatedAt: 0,
        invalidated: false,
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
      if (entry.request && (!refresh || background)) {
        if (refresh) entry.invalidated = true;
        return entry.request;
      }
      if (
        !refresh &&
        !entry.snapshot.restored &&
        entry.snapshot.data &&
        !entry.snapshot.error &&
        !entry.snapshot.data.issues.length &&
        Date.now() - entry.updatedAt < FRESH_MS
      )
        return Promise.resolve();
      entry.invalidated = false;
      publish(entry, {
        loading: !background || entry.snapshot.data === null,
        error: null,
        generation: entry.snapshot.generation + (refresh ? 1 : 0),
      });
      const request = Promise.resolve()
        .then(() => getAutomationOverview(locale))
        .then((data) => {
          if (entry.request === request) {
            entry.updatedAt = Date.now();
            saveAutomationOverviewSummary(locale, data);
            publish(entry, { data, error: null, restored: false });
          }
        })
        .catch((cause: unknown) => {
          if (entry.request === request)
            publish(entry, { error: getErrorMessage(cause, "") });
        })
        .finally(() => {
          if (entry.request === request) {
            entry.request = null;
            publish(entry, { loading: false });
            // Changes observed during a read need one follow-up, never parallel scans.
            if (entry.invalidated) void this.load(locale, true, true);
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
      clearAutomationOverviewSummary();
    },
  };
}

export const automationOverviewCache = createAutomationOverviewCache();
