import { useAnnotationMarkers } from "../shared/useAnnotationMarkers";
import { annotationsForPage } from "../shared/session";
import type { PreviewModel } from "../usePreviewWorkspace";
import type { PreviewTab } from "../shared/session";
import { BrowserSurface } from "../web/BrowserSurface";
import { MarkdownPreview } from "../markdown/MarkdownPreview";
import { CodeEditor } from "../../../components/file-reader/CodeEditor";
import { DevtoolsDock } from "./DevtoolsDock";
import { WebPageSource } from "./WebPageSource";

/** Keep each page mounted; visibility changes preserve browser and editor state. */
export function PreviewPageSurface({
  model,
  tab,
  shown,
  drawing,
}: {
  model: PreviewModel;
  tab: PreviewTab;
  shown: boolean;
  drawing: boolean;
}) {
  const active = model.active;
  const doc = model.documents[tab.id];
  useAnnotationMarkers(
    model.pageIds[tab.id],
    tab.revision,
    annotationsForPage(model.session, tab.id),
    shown && active?.id === tab.id && !model.source && !drawing,
    model.report,
    tab.address,
  );
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
          onLink={(href, invert) => void model.openDocumentLink(href, invert)}
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
                  if (!current || current.address === url) return previous;
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
              active={
                shown && active?.id === tab.id && !model.source && !drawing
              }
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
          {model.source &&
            active?.id === tab.id &&
            !doc &&
            model.pageIds[tab.id] && (
              <WebPageSource
                key={`${model.pageIds[tab.id]}:${tab.revision}`}
                pageId={model.pageIds[tab.id]}
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
}
