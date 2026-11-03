import { verifyPreviewContext } from "./shared/verifyContext";
import { annotationActions } from "./shared/annotationActions";
import { openWebLink } from "../../lib/openWebLink";
import { previewError } from "./shared/previewError";
import { copyScreenshot } from "./shared/copyScreenshot";
import {
  consumePreviewRequests,
  type PreviewOpenRequest,
} from "./shared/openRequests";
import { resolveAddress, type SearchEngine } from "./shared/address";
import { getSettings, setSettings } from "../../lib/tauri";
import { capturePreview } from "./shared/screenshot";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import {
  previewApi,
  type BrowserAction,
  type BrowserFrame,
  type BrowserInfo,
  type PreviewDocument,
  type PickedElement,
} from "./api";
import {
  addAnnotation,
  attachScreenshot,
  annotationsForPage,
  closePreview,
  navigatePreview,
  openPreview,
  restorePreview,
  updatePreview,
  type Annotation,
} from "./shared/session";
import {
  loadPreviewSession,
  savePreviewSession,
} from "./shared/sessionStorage";
import { getErrorMessage } from "../../lib/error";

export type PreviewPanel =
  "annotations" | "settings" | "history" | "tools" | "downloads";
export function usePreviewWorkspace() {
  const { t } = useTranslation();
  const [session, setSessionState] = useState(loadPreviewSession);
  const sessionRef = useRef(session);
  const setSession = (update: SetStateAction<typeof session>) => {
    const next =
      typeof update === "function" ? update(sessionRef.current) : update;
    sessionRef.current = next;
    setSessionState(next);
  };
  const [searchEngine, setSearchEngineState] = useState<SearchEngine>("bing");
  const setSearchEngine = (value: SearchEngine) => {
    setSearchEngineState(value);
    void setSettings("preview_search_engine", value).catch((error: unknown) =>
      setError(getErrorMessage(error, t("common.error"))),
    );
  };
  useEffect(() => {
    let disposed = false;
    void getSettings("preview_search_engine")
      .then((value) => {
        if (
          !disposed &&
          (value === "bing" || value === "google" || value === "duckduckgo")
        )
          setSearchEngineState(value);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);
  const [documents, setDocuments] = useState<Record<string, PreviewDocument>>(
    {},
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pageIds, setPageIdsState] = useState<Record<string, string>>({});
  const pageIdsRef = useRef<Record<string, string>>({});
  const setPageIds = (update: SetStateAction<Record<string, string>>) => {
    const next =
      typeof update === "function" ? update(pageIdsRef.current) : update;
    pageIdsRef.current = next;
    setPageIdsState(next);
  };
  const [info, setInfo] = useState<BrowserInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [source, setSource] = useState(false);
  const [sourceLine, setSourceLine] = useState<number | undefined>();
  const [panel, setPanel] = useState<PreviewPanel>("annotations");
  const [panelOpen, setPanelOpen] = useState(true);
  const [viewports, setViewports] = useState<
    Record<string, { width: number; height: number; mobile: boolean } | null>
  >({});
  const viewport = session.activeId
    ? (viewports[session.activeId] ?? null)
    : null;
  const setViewport = (value: typeof viewport) => {
    const id = sessionRef.current.activeId;
    if (id) setViewports((previous) => ({ ...previous, [id]: value }));
  };
  const [delivery, setDelivery] = useState<{
    text: string;
    images: string[];
    tabId: string;
    revision: string;
  } | null>(null);
  const [events, setEvents] = useState<
    Record<string, { method: string; params: Record<string, unknown> }[]>
  >({});
  const [notice, setNotice] = useState("");
  const active = session.tabs.find((tab) => tab.id === session.activeId);
  const document = active ? documents[active.id] : undefined;
  const draft = active ? drafts[active.id] : undefined;
  const dirty = !!document && draft !== undefined && draft !== document.content;
  const notes = active ? annotationsForPage(session, active.id) : [];
  const pageId = active ? pageIds[active.id] : undefined;
  const report = (error: unknown) => setError(previewError(error, t));
  useEffect(() => {
    let disposed = false;
    previewApi
      .info()
      .then((value) => {
        if (!disposed) setInfo(value);
      })
      .catch((error: unknown) => {
        if (!disposed) setError(getErrorMessage(error, t("common.error")));
      });
    return () => {
      disposed = true;
    };
  }, [t]);
  useEffect(() => savePreviewSession(session, info?.profiles), [session, info]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const resetView = () => {
    setSource(false);
    setSourceLine(undefined);
    setPicking(false);
    setError("");
  };
  const select = (id: string) => {
    setSession((previous) => ({ ...previous, activeId: id }));
    resetView();
  };
  const openWeb = (address = "about:blank", profile?: string) => {
    try {
      setSession((previous) =>
        openPreview(previous, {
          kind: "web",
          address,
          title: address,
          profile:
            profile ??
            previous.tabs.find((tab) => tab.id === previous.activeId)
              ?.profile ??
            "default",
        }),
      );
      resetView();
    } catch (error) {
      report(error);
    }
  };
  const acceptDocument = (opened: PreviewDocument) => {
    const id = `doc:${opened.id}`;
    if (
      sessionRef.current.tabs.length >= 12 &&
      !sessionRef.current.tabs.some((tab) => tab.id === id)
    ) {
      void previewApi.closeDocument(opened.id).catch(() => {});
      throw new Error("PREVIEW_TAB_LIMIT");
    }
    setDocuments((previous) => ({ ...previous, [id]: opened }));
    setDrafts((previous) =>
      previous[id] === undefined
        ? { ...previous, [id]: opened.content }
        : previous,
    );
    setSession((previous) =>
      updatePreview(
        openPreview(previous, {
          id,
          kind: opened.kind,
          address: opened.url ?? "",
          title: opened.title,
        }),
        id,
        { revision: `${opened.id}:${opened.revision}` },
      ),
    );
    resetView();
  };
  const openDocument = async () => {
    setBusy(true);
    setError("");
    try {
      const opened = await previewApi.pickDocument();
      if (opened) acceptDocument(opened);
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  const close = async (id: string) => {
    if (documents[id] && drafts[id] !== documents[id].content) {
      setNotice(t("preview.saveBeforeClose"));
      select(id);
      return;
    }
    const page = pageIds[id];
    if (page) {
      try {
        await previewApi.close(page);
      } catch (error) {
        report(error);
        return;
      }
      setPageIds((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
    }
    setSession((previous) => closePreview(previous, id));
    const retained = new Set(
      [...sessionRef.current.tabs, ...sessionRef.current.closed].map(
        (tab) => tab.id,
      ),
    );
    for (const [tab, document] of Object.entries(documents))
      if (!retained.has(tab))
        void previewApi.closeDocument(document.id).catch(report);
    const retain = <T>(values: Record<string, T>) =>
      Object.fromEntries(
        Object.entries(values).filter(([id]) => retained.has(id)),
      );
    setDocuments(retain);
    setDrafts(retain);
    setEvents(retain);
    setViewports(retain);
    resetView();
  };
  const action = async <T = unknown>(
    value: BrowserAction,
  ): Promise<T | undefined> => {
    if (!pageId) return;
    setError("");
    try {
      return await previewApi.action<T>(pageId, value);
    } catch (error) {
      report(error);
      return;
    }
  };
  const navigate = async (value: string) => {
    if (!value.trim()) return;
    try {
      const url = resolveAddress(value, searchEngine);
      if (!active || active.kind !== "web") {
        openWeb(url);
        return;
      }
      if (pageId) await previewApi.action(pageId, { kind: "navigate", url });
      setSession((previous) => navigatePreview(previous, active.id, url));
      setPicking(false);
    } catch (error) {
      report(error);
    }
  };
  const onFrame = (id: string, frame: BrowserFrame) => {
    setSession((previous) => {
      const tab = previous.tabs.find((tab) => tab.id === id);
      if (!tab) return previous;
      const title = frame.info.title || tab.title;
      if (
        tab.title === title &&
        tab.address === frame.info.url &&
        tab.revision === frame.info.revision
      )
        return previous;
      const history = frame.info.history;
      const next = history
        ? {
            ...previous,
            tabs: previous.tabs.map((item) =>
              item.id === id
                ? {
                    ...item,
                    history: history.entries
                      .slice(-100)
                      .map((entry) => entry.url),
                    cursor: Math.min(99, history.currentIndex),
                  }
                : item,
            ),
          }
        : previous;
      return updatePreview(next, id, {
        title,
        address: frame.info.url,
        revision: frame.info.revision,
      });
    });
    if (frame.events.length)
      setEvents((previous) => ({
        ...previous,
        [id]: [...(previous[id] ?? []), ...frame.events].slice(-150),
      }));
  };
  const capture = (
    tabId: string,
    value: Omit<Annotation, "id" | "tabId" | "revision" | "note">,
    revision?: string,
  ) => {
    if (sessionRef.current.activeId !== tabId) return;
    const tab = sessionRef.current.tabs.find((tab) => tab.id === tabId);
    if (!tab) return;
    if (revision && revision !== tab.revision) {
      setNotice(t("preview.pageChanged"));
      return;
    }
    try {
      setSession((previous) =>
        addAnnotation(previous, {
          ...value,
          id: crypto.randomUUID(),
          tabId,
          revision: tab.revision,
          note: "",
        }),
      );
      setPanel("annotations");
      setPanelOpen(true);
      setPicking(false);
    } catch (error) {
      report(error);
    }
  };
  const captureWeb = (id: string, value: PickedElement) =>
    capture(
      id,
      {
        selector: value.selector,
        domPath: value.domPath,
        viewport: value.viewport,
        text: value.text,
        html: value.html,
        styles: value.styles,
        bounds: value.documentBounds,
        accessibility: { role: value.role, label: value.label },
        screenshot: value.screenshot,
      },
      value.revision,
    );
  const changeDraft = (text: string) => {
    if (!active) return;
    setDrafts((previous) => ({ ...previous, [active.id]: text }));
    setSession((previous) =>
      updatePreview(previous, active.id, { revision: crypto.randomUUID() }),
    );
  };
  const save = async () => {
    if (!active || !document || draft === undefined) return;
    setBusy(true);
    setError("");
    try {
      const saved = await previewApi.saveDocument(
        document.id,
        draft,
        document.revision,
      );
      setDocuments((previous) => ({
        ...previous,
        [active.id]: { ...saved, url: document.url },
      }));
      setSession((previous) =>
        updatePreview(previous, active.id, {
          revision: `${saved.id}:${saved.revision}`,
        }),
      );
      if (pageId)
        await previewApi.action(pageId, { kind: "reload", hard: true });
      setNotice(t("preview.saved"));
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  const reloadDocument = async () => {
    if (!active || !document) return;
    if (dirty) {
      setNotice(t("preview.saveBeforeClose"));
      return;
    }
    try {
      const updated = await previewApi.readDocument(document.id);
      setDocuments((previous) => ({
        ...previous,
        [active.id]: { ...updated, url: document.url },
      }));
      setDrafts((previous) => ({ ...previous, [active.id]: updated.content }));
      setSession((previous) =>
        updatePreview(previous, active.id, {
          revision: `${updated.id}:${updated.revision}`,
        }),
      );
    } catch (error) {
      report(error);
    }
  };
  const discardDraft = () => {
    if (active && document) {
      setDrafts((previous) => ({ ...previous, [active.id]: document.content }));
      setSession((previous) =>
        updatePreview(previous, active.id, {
          revision: `${document.id}:${document.revision}`,
        }),
      );
    }
  };
  const screenshot = async (full = false, noteId?: string, copy = false) => {
    if (!active) return;
    setBusy(true);
    try {
      const note = noteId
        ? notes.find((note) => note.id === noteId)
        : undefined;
      const data = await capturePreview({ tab: active, pageId, note, full });
      if (
        sessionRef.current.tabs.find((tab) => tab.id === active.id)
          ?.revision !== active.revision
      )
        throw new Error(t("preview.pageChanged"));
      if (copy) {
        await verifyContext(active.id, active.revision);
        await copyScreenshot(data);
        setNotice(t("preview.copied"));
      } else if (note)
        setSession((previous) => attachScreenshot(previous, note.id, data));
      else
        await previewApi.export(
          full ? "page-full.png" : "page-viewport.png",
          data,
          true,
          active.kind === "markdown"
            ? undefined
            : { id: pageId ?? "", revision: active.revision },
        );
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };
  const verifyContext = (tabId: string, revision: string) =>
    verifyPreviewContext(
      { id: tabId, revision },
      () => ({
        tab: sessionRef.current.tabs.find((tab) => tab.id === tabId),
        pageId: pageIdsRef.current[tabId],
      }),
      t("preview.pageChanged"),
    );
  const { copyNotes, exportNotes } = annotationActions({
    tab: active,
    pageId,
    notes,
    verify: verifyContext,
    onCopied: () => setNotice(t("preview.copied")),
    onError: report,
  });
  const restore = (id?: string) => {
    setSession((previous) => restorePreview(previous, id));
    resetView();
  };
  const receiveDocument = useEffectEvent((value: PreviewOpenRequest) => {
    try {
      if (value.kind === "web") openWeb(value.address, value.profile);
      else acceptDocument(value.document);
    } catch (error) {
      report(error);
    }
  });
  useEffect(
    () => consumePreviewRequests((value) => receiveDocument(value)),
    [],
  );
  const openDocumentLink = async (href: string, invert = false) => {
    if (/^https?:\/\//i.test(href) || href.startsWith("//")) {
      try {
        await openWebLink(new URL(href, document?.url).href, {
          invert,
          profile: active?.profile,
        });
      } catch (error) {
        report(error);
      }
      return;
    }
    if (!document) return;
    try {
      const linked = await previewApi.openLink(document.id, href);
      if (linked.kind === "document") {
        acceptDocument({
          ...linked.document,
          fragment: href.includes("#")
            ? decodeURIComponent(href.split("#").slice(1).join("#"))
            : undefined,
        });
      } else {
        openWeb(linked.url);
      }
    } catch (error) {
      report(error);
    }
  };
  return {
    session,
    sessionRef,
    searchEngine,
    setSearchEngine,
    acceptDocument,
    setSession,
    documents,
    drafts,
    pageIds,
    pageIdsRef,
    setPageIds,
    info,
    setInfo,
    error,
    setError,
    busy,
    picking,
    setPicking,
    source,
    setSource,
    sourceLine,
    setSourceLine,
    panel,
    setPanel,
    panelOpen,
    setPanelOpen,
    viewport,
    viewports,
    setViewport,
    delivery,
    setDelivery,
    events,
    notice,
    setNotice,
    active,
    document,
    draft,
    dirty,
    notes,
    pageId,
    report,
    select,
    openWeb,
    openDocument,
    openDocumentLink,
    close,
    action,
    navigate,
    onFrame,
    capture,
    captureWeb,
    changeDraft,
    save,
    reloadDocument,
    discardDraft,
    screenshot,
    copyNotes,
    exportNotes,
    verifyContext,
    restore,
  };
}
export type PreviewModel = ReturnType<typeof usePreviewWorkspace>;
