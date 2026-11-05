import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PreviewModel } from "../usePreviewWorkspace";
import { capturePreview } from "../shared/screenshot";
import type { MarkupBase } from "./ScreenshotMarkup";
import { useTranslation } from "react-i18next";
import { addAnnotation } from "../shared/session";
import { previewError } from "../shared/previewError";

export function usePreviewMarkup(model: PreviewModel, shown: boolean) {
  const { t } = useTranslation();
  const [base, setBase] = useState<MarkupBase | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(model);
  const generation = useRef(0);
  useLayoutEffect(() => {
    live.current = model;
  });
  const pageId = model.active?.id,
    revision = model.active?.revision;
  useEffect(() => {
    const token = generation.current + 1;
    generation.current = token;
    setBase(null);
    setBusy(false);
    return () => {
      generation.current = token + 1;
    };
  }, [pageId, revision, shown, model.source]);
  const start = async () => {
    if (busy || !model.active || model.source) return;
    const page = model.active,
      token = generation.current;
    setBusy(true);
    model.setPicking(false);
    try {
      await model.verifyContext(page.id, page.revision);
      const data = await capturePreview({
        tab: page,
        pageId: model.pageId,
        full: false,
      });
      if (generation.current !== token) return;
      await model.verifyContext(page.id, page.revision);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(Error("PREVIEW_CLIPBOARD_INVALID"));
        image.src = `data:image/png;base64,${data}`;
      });
      if (generation.current !== token) return;
      if (
        !image.naturalWidth ||
        image.naturalWidth * image.naturalHeight > 32_000_000
      )
        throw Error("PREVIEW_CLIPBOARD_DIMENSIONS");
      setBase({ data, width: image.naturalWidth, height: image.naturalHeight });
    } catch (error) {
      if (generation.current === token) model.report(error);
    } finally {
      if (generation.current === token) setBusy(false);
    }
  };
  const apply = async (data: string) => {
    const page = live.current.active,
      token = generation.current;
    if (!page || !base) return;
    setBusy(true);
    try {
      await live.current.verifyContext(page.id, page.revision);
      if (generation.current !== token) return;
      live.current.setSession((previous) => {
        if (previous.activeId !== page.id)
          throw Error("PREVIEW_CONTEXT_CHANGED");
        return addAnnotation(previous, {
          id: crypto.randomUUID(),
          tabId: page.id,
          revision: page.revision,
          selector: t("preview.drawnScreenshot"),
          text: "",
          note: "",
          screenshot: data,
          contextKind: "image",
        });
      });
      live.current.setPanel("annotations");
      live.current.setPanelOpen(true);
      setBase(null);
    } catch (error) {
      throw new Error(previewError(error, t));
    } finally {
      if (generation.current === token) setBusy(false);
    }
  };
  return { base, busy, start, apply, cancel: () => setBase(null) };
}
