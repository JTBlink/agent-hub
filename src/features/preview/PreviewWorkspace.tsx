import { usePageFind } from "./shared/usePageFind";
import { useBrowserInventory } from "./web/useBrowserInventory";
import { DownloadsPanel } from "./components/DownloadsPanel";
import { PreviewToolbar } from "./components/PreviewToolbar";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Plus,
  X,
  Globe,
  UserRound,
  FileText,
  FileCode2,
  MousePointer2,
  Search,
  Download,
  Send,
  ExternalLink,
  FolderOpen,
  Copy,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { usePreviewWorkspace } from "./usePreviewWorkspace";
import { previewApi } from "./api";
import { BrowserSurface } from "./web/BrowserSurface";
import { MarkdownPreview } from "./markdown/MarkdownPreview";
import { CodeEditor } from "../../components/file-reader/CodeEditor";
import { ThemedSelect } from "../../components/ThemedSelect";
import { AnnotationPanel } from "./components/AnnotationPanel";
import { BrowserSettings } from "./components/BrowserSettings";
import { BrowserTools } from "./components/BrowserTools";
import { AgentDelivery } from "./components/AgentDelivery";
import { updatePreview } from "./shared/session";
import "./preview.css";

export function PreviewWorkspace({ shown }: { shown: boolean }) {
  const { t } = useTranslation();
  const model = usePreviewWorkspace();
  useBrowserInventory(shown, model);
  const [address, setAddress] = useState("");
  const [previousAddress, setPreviousAddress] = useState<string | undefined>();
  const [findOpen, setFindOpen] = useState(false);
  const { find, setFind, findResult, findPage } = usePageFind(model);
  const [bottomDock, setBottomDock] = useState(false);
  const active = model.active;
  if (previousAddress !== active?.address) {
    setPreviousAddress(active?.address);
    setAddress(active?.address ?? "");
  }
  const showPanel = (panel: typeof model.panel) => {
    model.setPanel(panel);
    model.setPanelOpen(true);
  };
  return (
    <section
      className={`preview-workspace ${bottomDock ? "dock-bottom" : ""}`}
      hidden={!shown}
      aria-label={t("preview.title")}
      onKeyDownCapture={(event) => {
        if (!shown) return;
        if (event.key === "F6") {
          event.preventDefault();
          document
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
          const input = document.querySelector<HTMLInputElement>(
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
        if (key === "w" && active) void model.close(active.id);
        if (key === "s") void model.save();
        if (key === "r") {
          if (model.document) void model.reloadDocument();
          if (model.pageId)
            void model.action({ kind: "reload", hard: event.shiftKey });
        }
      }}
    >
      <div
        className="preview-tabs"
        role="tablist"
        aria-label={t("preview.tabs")}
      >
        {model.session.tabs.map((tab) => (
          <div key={tab.id} className={tab.id === active?.id ? "active" : ""}>
            <button
              role="tab"
              aria-selected={tab.id === active?.id}
              onClick={() => model.select(tab.id)}
              title={tab.title}
            >
              {tab.kind === "markdown" ? (
                <FileText size={14} />
              ) : tab.kind === "html" ? (
                <FileCode2 size={14} />
              ) : (
                <Globe size={14} />
              )}
              <span>{tab.title}</span>
              {model.documents[tab.id] &&
                model.drafts[tab.id] !== model.documents[tab.id].content && (
                  <span>●</span>
                )}
            </button>
            <button
              aria-label={t("preview.closeTab", { title: tab.title })}
              onClick={() => void model.close(tab.id)}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          title={t("preview.newTab")}
          aria-label={t("preview.newTab")}
          onClick={() => model.openWeb()}
        >
          <Plus size={16} />
        </button>
        <button
          title={t("preview.newGuestTab")}
          aria-label={t("preview.newGuestTab")}
          onClick={() => model.openWeb("about:blank", "guest")}
        >
          <UserRound size={16} />
        </button>
        <button
          title={t("preview.openDocument")}
          aria-label={t("preview.openDocument")}
          disabled={model.busy}
          onClick={() => void model.openDocument()}
        >
          <FolderOpen size={16} />
        </button>
      </div>
      <div className="preview-addressbar">
        <button
          title={t("preview.back")}
          disabled={!model.pageId}
          onClick={() => void model.action({ kind: "back" })}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          title={t("preview.forward")}
          disabled={!model.pageId}
          onClick={() => void model.action({ kind: "forward" })}
        >
          <ArrowRight size={16} />
        </button>
        <button
          title={t("preview.reload")}
          disabled={!active || model.busy}
          onClick={() => {
            if (model.document) void model.reloadDocument();
            if (model.pageId)
              void model.action({ kind: "reload", hard: false });
          }}
        >
          <RotateCw size={16} />
        </button>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void model.navigate(address);
          }}
        >
          <Globe size={14} />
          <input
            data-preview-address
            aria-label={t("preview.address")}
            value={address}
            placeholder={t("preview.addressPlaceholder")}
            onChange={(event) => setAddress(event.target.value)}
          />
        </form>
        <ThemedSelect
          aria-label={t("preview.profiles")}
          value={active?.profile ?? "default"}
          disabled={!active}
          onChange={async (event) => {
            const profile = event.target.value;
            if (active) {
              if (model.pageId) {
                try {
                  await previewApi.close(model.pageId);
                } catch (error) {
                  model.report(error);
                  return;
                }
              }
              model.setSession((previous) =>
                updatePreview(previous, active.id, {
                  profile,
                  revision: crypto.randomUUID(),
                }),
              );
              model.setPageIds((previous) => {
                const next = { ...previous };
                delete next[active.id];
                return next;
              });
            }
          }}
        >
          {(
            model.info?.profiles ?? [
              { id: "default", name: t("preview.defaultProfile") },
            ]
          ).map((profile) => (
            <option
              key={profile.id}
              value={profile.id}
              disabled={profile.deleting}
            >
              {profile.id === "guest" && profile.name === "Guest"
                ? t("preview.guestProfile")
                : profile.name}
            </option>
          ))}
        </ThemedSelect>
        <button
          aria-label={t("preview.openExternal")}
          title={t("preview.openExternal")}
          disabled={!active || !/^https?:/.test(active.address)}
          onClick={() => {
            if (active) void openUrl(active.address).catch(model.report);
          }}
        >
          <ExternalLink size={16} />
        </button>
      </div>
      <PreviewToolbar
        model={model}
        findOpen={findOpen}
        setFindOpen={setFindOpen}
        showPanel={showPanel}
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
                hidden={active?.id !== tab.id}
              >
                {tab.kind === "markdown" && doc ? (
                  <MarkdownPreview
                    document={doc}
                    draft={model.drafts[tab.id] ?? doc.content}
                    onChange={model.busy ? undefined : model.changeDraft}
                    source={model.source && active?.id === tab.id}
                    sourceLine={model.sourceLine}
                    picking={model.picking && active?.id === tab.id}
                    onCapture={(value) => model.capture(tab.id, value)}
                    onLink={(href) => void model.openDocumentLink(href)}
                  />
                ) : (
                  <>
                    <div
                      className="preview-native-page"
                      hidden={model.source && active?.id === tab.id}
                    >
                      <BrowserSurface
                        key={`${tab.id}:${tab.profile}`}
                        tabId={tab.id}
                        initialId={model.pageIds[tab.id]}
                        active={shown && active?.id === tab.id && !model.source}
                        address={tab.address}
                        profile={tab.profile}
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
              </div>
            );
          })}
        </div>
        {model.panelOpen &&
          (model.panel === "annotations" ? (
            <AnnotationPanel model={model} />
          ) : model.panel === "settings" ? (
            <BrowserSettings model={model} />
          ) : model.panel === "downloads" ? (
            <DownloadsPanel model={model} />
          ) : model.panel === "tools" ? (
            <BrowserTools
              key={`${active?.id}:${active?.revision}`}
              model={model}
            />
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
          ))}
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
                .then((api) => api.writeText(active.address))
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
          text={model.delivery.text}
          images={model.delivery.images}
          isCurrent={() =>
            model.sessionRef.current.tabs.some(
              (tab) =>
                tab.id === model.delivery?.tabId &&
                tab.revision === model.delivery?.revision,
            )
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
