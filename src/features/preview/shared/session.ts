import type { ExecutionLocation } from "../api";
import type { CaptureViewport } from "./captureContext";
export type PreviewKind = "web" | "html" | "markdown" | "resource";
export interface PreviewTab {
  id: string;
  kind: PreviewKind;
  title: string;
  address: string;
  profile: string;
  revision: string;
  history: string[];
  cursor: number;
  execution?: ExecutionLocation;
}
export interface Annotation {
  id: string;
  tabId: string;
  revision: string;
  selector: string;
  pageTitle?: string;
  pageUrl?: string;
  accessibility?: { role?: string | null; label?: string | null };
  text: string;
  note: string;
  html?: string;
  styles?: Record<string, string>;
  sourceLine?: number;
  sourceEndLine?: number;
  domPath?: string[];
  viewport?: CaptureViewport;
  screenshot?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}
export interface PreviewSession {
  tabs: PreviewTab[];
  activeId: string | null;
  closed: PreviewTab[];
  annotations: Annotation[];
}
export function createSession(): PreviewSession {
  return { tabs: [], activeId: null, closed: [], annotations: [] };
}
export function openPreview(
  state: PreviewSession,
  input: Pick<PreviewTab, "kind" | "address" | "title"> & {
    profile?: string;
    id?: string;
  },
): PreviewSession {
  if (input.id && state.tabs.some((tab) => tab.id === input.id))
    return { ...state, activeId: input.id };
  if (state.tabs.length >= 12) throw new Error("PREVIEW_TAB_LIMIT");
  const tab: PreviewTab = {
    ...input,
    id: input.id ?? crypto.randomUUID(),
    revision: crypto.randomUUID(),
    profile: input.profile ?? "default",
    history: [input.address],
    cursor: 0,
  };
  return { ...state, tabs: [...state.tabs, tab], activeId: tab.id };
}
export function navigatePreview(
  state: PreviewSession,
  id: string,
  address: string,
  historyIndex?: number,
): PreviewSession {
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === id
        ? {
            ...tab,
            address,
            revision: crypto.randomUUID(),
            history:
              historyIndex === undefined
                ? [...tab.history.slice(0, tab.cursor + 1), address].slice(-100)
                : tab.history,
            cursor: historyIndex ?? Math.min(tab.cursor + 1, 99),
          }
        : tab,
    ),
  };
}
export function updatePreview(
  state: PreviewSession,
  id: string,
  patch: Partial<
    Pick<PreviewTab, "title" | "address" | "revision" | "profile" | "execution">
  >,
): PreviewSession {
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
  };
}
export function addAnnotation(
  state: PreviewSession,
  annotation: Annotation,
): PreviewSession {
  const tab = state.tabs.find((tab) => tab.id === annotation.tabId);
  if (!tab || tab.revision !== annotation.revision)
    throw new Error("PREVIEW_STALE_CAPTURE");
  if (annotationsForPage(state, tab.id).length >= 20)
    throw new Error("PREVIEW_ANNOTATION_LIMIT");
  if (
    state.annotations.filter(
      (note) => note.tabId !== tab.id || note.revision === tab.revision,
    ).length >= 200
  )
    throw new Error("PREVIEW_ANNOTATION_LIMIT");
  const next = {
    ...state,
    annotations: [
      ...state.annotations.filter(
        (note) => note.tabId !== tab.id || note.revision === tab.revision,
      ),
      { ...annotation, pageTitle: tab.title, pageUrl: tab.address },
    ],
  };
  return annotation.screenshot
    ? attachScreenshot(next, annotation.id, annotation.screenshot)
    : next;
}
export function annotationsForPage(
  state: PreviewSession,
  id: string,
): Annotation[] {
  const tab = state.tabs.find((tab) => tab.id === id);
  return state.annotations.filter(
    (note) => note.tabId === id && note.revision === tab?.revision,
  );
}
export function closePreview(
  state: PreviewSession,
  id: string,
): PreviewSession {
  const tab = state.tabs.find((tab) => tab.id === id);
  if (!tab) return state;
  const index = state.tabs.indexOf(tab);
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  return {
    ...state,
    tabs,
    closed: [...state.closed, { ...tab, execution: undefined }].slice(-20),
    annotations: state.annotations.filter((note) =>
      [...tabs, ...state.closed.slice(-19), tab].some(
        (retained) => retained.id === note.tabId,
      ),
    ),
    activeId:
      state.activeId === id
        ? (tabs[Math.max(0, index - 1)]?.id ?? null)
        : state.activeId,
  };
}
export function restorePreview(
  state: PreviewSession,
  id?: string,
): PreviewSession {
  const tab = id
    ? state.closed.find((tab) => tab.id === id)
    : state.closed.at(-1);
  if (!tab || state.tabs.length >= 12) return state;
  return {
    ...state,
    tabs: [...state.tabs, { ...tab, execution: undefined }],
    closed: state.closed.filter((item) => item.id !== tab.id),
    activeId: tab.id,
  };
}
export function formatAnnotations(
  tab: PreviewTab,
  notes: Annotation[],
): string {
  return [
    `# ${tab.title}`,
    `URL: ${tab.address}`,
    `Revision: ${tab.revision}`,
    ...notes.map(
      (note, index) =>
        `## ${index + 1}. ${note.selector}\n${note.sourceLine ? `Source: ${tab.title}:${note.sourceLine}${note.sourceEndLine ? `-${note.sourceEndLine}` : ""}\n` : ""}\n${note.domPath?.length ? `DOM path: ${note.domPath.join(" > ")}\n` : ""}${note.viewport ? `Viewport: ${JSON.stringify(note.viewport)}\n` : ""}${note.bounds ? `Bounds: ${JSON.stringify(note.bounds)}\n` : ""}${note.text}\n\n${note.note}\n\n${note.html ? `DOM:\n\`\`\`html\n${note.html}\n\`\`\`` : ""}\n${note.accessibility ? `Accessibility: ${JSON.stringify(note.accessibility)}\n` : ""}${note.styles ? `CSS:\n\`\`\`json\n${JSON.stringify(note.styles, null, 2)}\n\`\`\`` : ""}`,
    ),
  ].join("\n\n");
}

export function attachScreenshot(
  state: PreviewSession,
  id: string,
  data: string,
): PreviewSession {
  const note = state.annotations.find((note) => note.id === id);
  if (
    !note ||
    !annotationsForPage(state, note.tabId).some((note) => note.id === id)
  )
    throw new Error("PREVIEW_STALE_CAPTURE");
  const total = state.annotations.reduce(
    (bytes, note) =>
      bytes + (note.id === id ? 0 : (note.screenshot?.length ?? 0)),
    0,
  );
  if (data.length > 3 * 1024 * 1024 || total + data.length > 32 * 1024 * 1024)
    throw new Error("PREVIEW_CAPTURE_LIMIT");
  return {
    ...state,
    annotations: state.annotations.map((note) =>
      note.id === id ? { ...note, screenshot: data } : note,
    ),
  };
}

export function resetDeletedProfile(
  state: PreviewSession,
  id: string,
): PreviewSession {
  const affected = new Set(
    [...state.tabs, ...state.closed]
      .filter((tab) => tab.profile === id)
      .map((tab) => tab.id),
  );
  const reset = (tab: PreviewTab) =>
    affected.has(tab.id)
      ? {
          ...tab,
          profile: "default",
          revision: crypto.randomUUID(),
          execution: undefined,
        }
      : tab;
  return {
    ...state,
    tabs: state.tabs.map(reset),
    closed: state.closed.map(reset),
    annotations: state.annotations.filter((note) => !affected.has(note.tabId)),
  };
}
