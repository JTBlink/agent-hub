import { PreviewPageSurface } from "./components/PreviewPageSurface";
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
  FolderOpen,
  FileCode2,
  Eye,
} from "lucide-react";
import { usePreviewWorkspace } from "./usePreviewWorkspace";
import { type PreviewDocument } from "./api";
import { ProfileSelector } from "./components/ProfileSelector";
import { AnnotationPanel } from "./components/AnnotationPanel";
import { BrowserSettings } from "./components/BrowserSettings";
import "./preview.css";
import { usePreviewMarkup } from "./markup/usePreviewMarkup";
import { ScreenshotMarkup } from "./markup/ScreenshotMarkup";

export interface PreviewWorkspaceHandle {
  requestClose: () => boolean;
}

export function PreviewWorkspace({
  shown,
  deliveryAdapter,
  workspacePath,
  projectId,
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
  workspacePath?: string;
  projectId?: string;
}) {
  const workspace = useRef<HTMLElement>(null);
  const { t } = useTranslation();
  const model = usePreviewWorkspace({ initialDocument, isolated: embedded });
  const markup = usePreviewMarkup(model, shown);
  useImperativeHandle(ref, () => ({ requestClose: model.requestClose }));
  useBrowserInventory(shown, model);
  const [address, setAddress] = useState("");
  const [showSourcePath, setShowSourcePath] = useState(true);
  const [previousAddress, setPreviousAddress] = useState<string | undefined>();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const { find, setFind, findResult, findPage } = usePageFind(model);
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
    (model.document && model.document.kind !== "resource") ||
    active?.kind === "web" ? (
      <button
        disabled={!model.document && !model.pageId}
        aria-pressed={model.source}
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
      className="preview-workspace"
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
          {model.session.tabs.map((tab) => (
            <PreviewPageSurface
              key={tab.id}
              model={model}
              tab={tab}
              shown={shown}
              drawing={!!markup.base}
            />
          ))}
          {markup.base && (
            <ScreenshotMarkup
              base={markup.base}
              busy={markup.busy}
              onApply={markup.apply}
              onCancel={markup.cancel}
            />
          )}
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
              <AnnotationPanel
                key={`${active?.id}:${active?.revision}:${workspacePath}`}
                model={model}
                deliveryAdapter={deliveryAdapter}
                workspacePath={workspacePath}
                projectId={projectId}
                onDraw={() => void markup.start()}
                drawingBusy={markup.busy || !!markup.base}
              />
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
      {model.notice && (
        <div role="status" className="preview-notice">
          {model.notice}
        </div>
      )}
    </section>
  );
}
