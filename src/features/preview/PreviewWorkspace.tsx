import { createPortal } from "react-dom";
import { PreviewTabs, PreviewNewTab } from "./components/PreviewTabs";
import { ResizableSidebar } from "../../components/ResizableSidebar";
import { KernelInfo } from "./components/KernelInfo";
import { ExecutionLocation } from "./components/ExecutionLocation";
import { usePageFind } from "./shared/usePageFind";
import { useBrowserInventory } from "./web/useBrowserInventory";
import { DownloadsPanel } from "./components/DownloadsPanel";
import { PreviewAddress } from "./components/PreviewAddress";
import { PreviewInspectActions } from "./components/PreviewInspectActions";
import { DevtoolsDock } from "./components/DevtoolsDock";
import { PreviewToolbar } from "./components/PreviewToolbar";
import { useImperativeHandle, useState, useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Plus,
  X,
  Globe,
  MousePointer2,
  Search,
  Download,
  Send,
  FolderOpen,
  Copy,
  FileCode2,
  Eye,
} from "lucide-react";
import { usePreviewWorkspace } from "./usePreviewWorkspace";
import { previewApi, type PreviewDocument } from "./api";
import { BrowserSurface } from "./web/BrowserSurface";
import { MarkdownPreview } from "./markdown/MarkdownPreview";
import { CodeEditor } from "../../components/file-reader/CodeEditor";
import { ProfileSelector } from "./components/ProfileSelector";
import { AnnotationPanel } from "./components/AnnotationPanel";
import { BrowserSettings } from "./components/BrowserSettings";
import { AgentDelivery } from "./components/AgentDelivery";
import "./preview.css";

export interface PreviewWorkspaceHandle {
  requestClose: () => boolean;
}

export function PreviewWorkspace({
  shown,
  deliveryAdapter,
  initialDocument,
  embedded = false,
  ref,
  onClose,
  onSource,
  sourceToolbarContainer,
}: {
  shown: boolean;
  initialDocument?: PreviewDocument;
  embedded?: boolean;
  ref?: Ref<PreviewWorkspaceHandle>;
  onClose?: () => void;
  /** Return a project preview to its matching workspace file editor. */
  onSource?: () => void;
  /** Mount the source action in the workspace tab toolbar when embedded. */
  sourceToolbarContainer?: HTMLElement | null;
  deliveryAdapter?: import("../../lib/agentDelivery").AgentDeliveryAdapter;
}) {
  const workspace = useRef<HTMLElement>(null);
  const { t } = useTranslation();
  const model = usePreviewWorkspace({ initialDocument, isolated: embedded });
  useImperativeHandle(ref, () => ({ requestClose: model.requestClose }));
  useBrowserInventory(shown, model);
  const [address, setAddress] = useState("");
  const [showSourcePath, setShowSourcePath] = useState(true);
  const [previousAddress, setPreviousAddress] = useState<string | undefined>();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const { find, setFind, findResult, findPage } = usePageFind(model);
  const [bottomDock, setBottomDock] = useState(false);
  const active = model.active;
  const sourcePath = model.document?.path;
  const sourceAddress = showSourcePath ? sourcePath : undefined;
  const showingSource = Boolean(sourceAddress);
  const visibleAddress = sourceAddress ?? address;
  if (previousAddress !== active?.address) {
    setPreviousAddress(active?.address);
    setAddress(active?.address ?? "");
  }
  const showPanel = (panel: typeof model.panel) => {
    model.setPanel(panel);
    model.setPanelOpen(true);
  };
  const sourceAction =
    model.document && model.document.kind !== "resource" ? (
      <button
        className={
          sourceToolbarContainer !== undefined
            ? "app-button-ghost h-7 w-7 shrink-0 p-0"
            : undefined
        }
        aria-label={t(
          model.source ? "fileReader.preview" : "fileReader.source",
        )}
        title={t(model.source ? "fileReader.preview" : "fileReader.source")}
        onClick={() => {
          if (
            !model.source &&
            onSource &&
            model.document?.id === initialDocument?.id
          ) {
            onSource();
            return;
          }
          model.setSource(!model.source);
          model.setPicking(false);
          model.setSourceLine(undefined);
        }}
      >
        {model.source ? <Eye size={16} /> : <FileCode2 size={16} />}
      </button>
    ) : null;
  return (
    <section
      ref={workspace}
      className={`preview-workspace ${bottomDock ? "dock-bottom" : ""}`}
      hidden={!shown}
      aria-label={t("preview.title")}
      onKeyDownCapture={(event) => {
        if (!shown) return;
        if (event.key === "F12") {
          event.preventDefault();
          event.stopPropagation();
          void model.openDevtools();
          return;
        }
        if (event.key === "F6") {
          event.preventDefault();
          event.currentTarget
            .querySelector<HTMLInputElement>("[data-preview-address]")
            ?.focus();
          return;
        }
        if (event.key === "Escape") {
          model.setPicking(false);
          setFindOpen(false);
          return;
        }
        if (
          !(navigator.userAgent.includes("Mac") ? event.metaKey : event.ctrlKey)
        )
          return;
        const key = event.key.toLowerCase();
        if (!["r", "f", "t", "w", "s", "l"].includes(key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (key === "l") {
          const input = event.currentTarget.querySelector<HTMLInputElement>(
            "[data-preview-address]",
          );
          input?.focus();
          input?.select();
        }
        if (key === "f") setFindOpen(true);
        if (key === "t") {
          if (event.shiftKey) model.restore();
          else model.openWeb();
        }
        if (key === "w" && active) {
          if (embedded && model.session.tabs.length === 1 && onClose) onClose();
          else void model.close(active.id);
        }
        if (key === "s") void model.save();
        if (key === "r") {
          if (model.document) void model.reloadDocument();
          if (model.pageId || model.native)
            void model.action({ kind: "reload", hard: event.shiftKey });
        }
      }}
    >
      {(!embedded || model.session.tabs.length > 1) && (
        <PreviewTabs model={model} />
      )}
      <div className="preview-addressbar">
        {embedded && model.session.tabs.length <= 1 && (
          <PreviewNewTab model={model} />
        )}
        <button
          title={t("preview.back")}
          disabled={!model.pageId && !model.native}
          onClick={() => void model.action({ kind: "back" })}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          title={t("preview.forward")}
          disabled={!model.pageId && !model.native}
          onClick={() => void model.action({ kind: "forward" })}
        >
          <ArrowRight size={16} />
        </button>
        <button
          title={t("preview.reload")}
          disabled={!active || model.busy}
          onClick={() => {
            if (model.document) void model.reloadDocument();
            if (model.pageId || model.native)
              void model.action({ kind: "reload", hard: false });
          }}
        >
          <RotateCw size={16} />
        </button>
        <PreviewAddress
          value={visibleAddress}
          sourcePath={sourcePath}
          showingSource={showingSource}
          onToggle={() => setShowSourcePath((previous) => !previous)}
          onChange={setAddress}
          onNavigate={() => void model.navigate(address)}
        />
        <ProfileSelector
          active={active}
          profiles={model.info?.profiles}
          onOpen={model.openWeb}
        />
        {sourceToolbarContainer === undefined
          ? sourceAction
          : sourceToolbarContainer &&
            createPortal(sourceAction, sourceToolbarContainer)}
        <PreviewInspectActions model={model} />
        <PreviewToolbar
          model={model}
          findOpen={findOpen}
          setFindOpen={setFindOpen}
          showPanel={showPanel}
          onAbout={() => setAboutOpen(true)}
        >
          {active && (
            <ExecutionLocation
              native={model.native}
              execution={active.execution}
              markdown={active.kind === "markdown"}
            />
          )}
        </PreviewToolbar>
      </div>
      <KernelInfo
        open={aboutOpen}
        returnFocus={() =>
          workspace.current
            ?.querySelector<HTMLButtonElement>(".preview-more-trigger")
            ?.focus()
        }
        onClose={() => setAboutOpen(false)}
        backend={model.native ? "native" : "chromium"}
        pageId={model.pageId}
      />
      {findOpen && (
        <form
          className="preview-find"
          onSubmit={(event) => {
            event.preventDefault();
            void findPage();
          }}
        >
          <Search size={13} />
          <input
            autoFocus
            value={find}
            onChange={(event) => {
              setFind(event.target.value);
            }}
            aria-label={t("preview.find")}
            placeholder={t("preview.find")}
          />
          <span>{findResult}</span>
          <button
            type="button"
            disabled={!find}
            onClick={() => void findPage(true)}
          >
            {t("preview.previousMatch")}
          </button>
          <button disabled={!find}>{t("preview.nextMatch")}</button>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => setFindOpen(false)}
          >
            <X size={14} />
          </button>
        </form>
      )}
      {model.picking && (
        <div className="preview-pick-hint">
          <MousePointer2 size={13} />
          {t("preview.pickHint")}
          <button onClick={() => model.setPicking(false)}>
            {t("common.cancel")} · Esc
          </button>
        </div>
      )}
      {model.error && (
        <div role="alert" className="preview-error">
          <span>
            {model.error.includes("PREVIEW_DOCUMENT_CONFLICT")
              ? t("preview.documentConflict")
              : model.error}
          </span>
          <button
            onClick={() => model.setError("")}
            aria-label={t("common.close")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {model.dirty && (
        <div className="preview-dirty">
          <span>{t("preview.unsaved")}</span>
          <button disabled={model.busy} onClick={() => void model.save()}>
            {t("common.save")}
          </button>
          <button disabled={model.busy} onClick={model.discardDraft}>
            {t("preview.discardDraft")}
          </button>
        </div>
      )}
      <div className="preview-body">
        <div className="preview-canvas">
          {!active && (
            <div className="preview-welcome">
              <Globe size={36} />
              <h1>{t("preview.title")}</h1>
              <p>{t("preview.welcome")}</p>
              <div>
                <button
                  className="app-button-primary"
                  onClick={() => model.openWeb()}
                >
                  <Plus size={15} />
                  {t("preview.newTab")}
                </button>
                <button
                  className="app-button-ghost"
                  onClick={() => void model.openDocument()}
                >
                  <FolderOpen size={15} />
                  {t("preview.openDocument")}
                </button>
              </div>
            </div>
          )}
          {model.session.tabs.map((tab) => {
            const doc = model.documents[tab.id];
            return (
              <div
                key={tab.id}
                className="preview-tab-content"
                data-preview-tab-id={tab.id}
                hidden={active?.id !== tab.id}
              >
                {tab.kind === "markdown" && doc ? (
                  <MarkdownPreview
                    document={doc}
                    active={shown && active?.id === tab.id}
                    draft={model.drafts[tab.id] ?? doc.content}
                    onChange={model.busy ? undefined : model.changeDraft}
                    source={model.source && active?.id === tab.id}
                    sourceLine={model.sourceLine}
                    picking={model.picking && active?.id === tab.id}
                    onCapture={(value) => model.capture(tab.id, value)}
                    onLink={(href, invert) =>
                      void model.openDocumentLink(href, invert)
                    }
                  />
                ) : (
                  <>
                    <div
                      className="preview-native-page"
                      hidden={model.source && active?.id === tab.id}
                    >
                      <BrowserSurface
                        key={`${tab.id}:${tab.profile}`}
                        onBackend={(backend) =>
                          model.setNativeTabs((previous) =>
                            previous[tab.id] === (backend === "native")
                              ? previous
                              : { ...previous, [tab.id]: backend === "native" },
                          )
                        }
                        onNativeNavigation={(handler) =>
                          model.registerNative(tab.id, handler)
                        }
                        onNativeLocation={(url) =>
                          model.setSession((previous) => {
                            const current = previous.tabs.find(
                              (item) => item.id === tab.id,
                            );
                            if (!current || current.address === url)
                              return previous;
                            return {
                              ...previous,
                              tabs: previous.tabs.map((item) =>
                                item.id === tab.id
                                  ? {
                                      ...item,
                                      address: url,
                                      title: url,
                                      revision: crypto.randomUUID(),
                                    }
                                  : item,
                              ),
                            };
                          })
                        }
                        tabId={tab.id}
                        initialId={model.pageIds[tab.id]}
                        active={shown && active?.id === tab.id && !model.source}
                        address={tab.address}
                        onNewTab={(url) => model.openWeb(url, "native")}
                        profile={tab.profile}
                        onPickingChange={model.setPicking}
                        picking={model.picking}
                        viewport={model.viewports[tab.id] ?? null}
                        onReady={(id) =>
                          model.setPageIds((previous) => ({
                            ...previous,
                            [tab.id]: id,
                          }))
                        }
                        onFrame={(frame) => model.onFrame(tab.id, frame)}
                        onCapture={(value) => model.captureWeb(tab.id, value)}
                        onError={model.report}
                      />
                    </div>
                    {model.source && active?.id === tab.id && doc && (
                      <CodeEditor
                        file={{
                          path: doc.title,
                          content: model.drafts[tab.id] ?? doc.content,
                        }}
                        onChange={model.busy ? undefined : model.changeDraft}
                        wrap
                      />
                    )}
                  </>
                )}
                {model.devtoolsPageId &&
                  model.devtoolsPageId === model.pageIds[tab.id] && (
                    <DevtoolsDock
                      key={model.devtoolsPageId}
                      pageId={model.devtoolsPageId}
                      tab={tab}
                      active={shown && active?.id === tab.id}
                      onClose={model.closeDevtools}
                      onError={model.report}
                    />
                  )}
              </div>
            );
          })}
        </div>
        {model.panelOpen && (
          <ResizableSidebar
            storageKey="agent-hub.preview.inspector-width"
            label={t("preview.annotations")}
            side="right"
            defaultWidth={300}
            minWidth={240}
            maxWidth={700}
            reserveWidth={200}
            constrainToParent
            className="preview-inspector-size"
          >
            {model.panel === "annotations" ? (
              <AnnotationPanel model={model} />
            ) : model.panel === "settings" ? (
              <BrowserSettings model={model} />
            ) : model.panel === "downloads" ? (
              <DownloadsPanel model={model} />
            ) : (
              <aside className="preview-inspector">
                <header>
                  <h2>{t("preview.history")}</h2>
                  <button
                    aria-label={t("common.close")}
                    onClick={() => model.setPanelOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <div className="preview-inspector-scroll">
                  <h3>{t("preview.currentTab")}</h3>
                  {active?.history.map((url, index) => (
                    <button
                      className="preview-history-item"
                      key={`${url}-${index}`}
                      onClick={() => void model.navigate(url)}
                    >
                      {url}
                    </button>
                  ))}
                  <h3>{t("preview.recentlyClosed")}</h3>
                  {model.session.closed
                    .slice()
                    .reverse()
                    .map((tab) => (
                      <button
                        className="preview-history-item"
                        key={tab.id}
                        onClick={() => model.restore(tab.id)}
                      >
                        {tab.title}
                      </button>
                    ))}
                </div>
              </aside>
            )}
          </ResizableSidebar>
        )}
      </div>
      <footer className="preview-status">
        <span>
          {active
            ? `${active.kind} · ${model.viewport ? `${model.viewport.width} × ${model.viewport.height}` : t("preview.adaptive")}`
            : t("preview.ready")}
        </span>
        <span>{t("preview.noteCount", { count: model.notes.length })}</span>
        <button onClick={() => setBottomDock(!bottomDock)}>
          {bottomDock ? t("preview.rightDock") : t("preview.bottomDock")}
        </button>
        {model.document && (
          <button
            onClick={() =>
              void previewApi
                .export(
                  model.document!.title,
                  model.draft ?? model.document!.content,
                )
                .catch(model.report)
            }
          >
            <Download size={12} />
            {t("preview.exportDocument")}
          </button>
        )}
        <button
          disabled={!active}
          onClick={() => {
            if (active)
              void import("@tauri-apps/plugin-clipboard-manager")
                .then((api) => api.writeText(sourceAddress ?? active.address))
                .then(() => model.setNotice(t("preview.copied")))
                .catch(model.report);
          }}
        >
          <Copy size={12} />
          {t("preview.copyAddress")}
        </button>
        <button
          disabled={!active || !model.notes.length}
          onClick={() => {
            if (active) void model.copyNotes();
          }}
        >
          <Send size={12} />
          {t("preview.copyNotes")}
        </button>
      </footer>
      {model.notice && (
        <div role="status" className="preview-notice">
          {model.notice}
        </div>
      )}
      {model.delivery !== null && (
        <AgentDelivery
          adapter={deliveryAdapter}
          page={model.delivery.page}
          annotations={model.delivery.annotations}
          text={model.delivery.text}
          images={model.delivery.images}
          verifyCurrent={() =>
            model.verifyContext(model.delivery!.tabId, model.delivery!.revision)
          }
          stale={
            !model.session.tabs.some(
              (tab) =>
                tab.id === model.delivery?.tabId &&
                tab.revision === model.delivery?.revision,
            )
          }
          onClose={() => model.setDelivery(null)}
          onSent={(copied) => {
            model.setDelivery(null);
            model.setNotice(t(copied ? "preview.copied" : "preview.delivered"));
          }}
        />
      )}
    </section>
  );
}
