import { useEffect, useEffectEvent, useRef } from "react";
import { previewApi } from "../api";
import type { Annotation } from "./session";
import runtime from "./annotationMarkers.js?raw";
import { getErrorMessage } from "../../../lib/error";

export function annotationMarkersScript(
  revision: string,
  notes: readonly Annotation[],
  colors: { background: string; foreground: string },
  url?: string,
) {
  const markers = notes.flatMap((note, index) =>
    note.bounds
      ? [
          {
            id: note.id,
            number: index + 1,
            path: note.domPath ?? note.selector.split(" > "),
            bounds: note.bounds,
          },
        ]
      : [],
  );
  return `(${runtime.trim().replace(/;$/, "")})(${JSON.stringify({ revision, url, markers, ...colors })})`;
}

/** The page owns marker geometry, so native and streamed pages follow scroll identically. */
export function useAnnotationMarkers(
  pageId: string | undefined,
  revision: string,
  notes: readonly Annotation[],
  active: boolean,
  onError: (message: string) => void,
  address?: string,
) {
  const queue = useRef(Promise.resolve());
  const renderScript = useEffectEvent(
    (colors: { background: string; foreground: string }) =>
      annotationMarkersScript(revision, active ? notes : [], colors, address),
  );
  const report = useEffectEvent((cause: unknown) =>
    onError(getErrorMessage(cause, String(cause))),
  );
  // Editing note text must not recreate the page overlay.
  const hasMarkers = notes.some((note) => !!note.bounds);
  const geometry = JSON.stringify(
    notes.map(({ id, selector, domPath, bounds }) => ({
      id,
      selector,
      domPath,
      bounds,
    })),
  );
  useEffect(() => {
    if (!pageId || !active || !hasMarkers) return;
    let disposed = false;
    const sync = () => {
      const styles = getComputedStyle(document.documentElement);
      const colors = {
        background:
          styles.getPropertyValue("--color-accent").trim() || "Highlight",
        foreground:
          styles.getPropertyValue("--color-on-accent").trim() ||
          "HighlightText",
      };
      const expression = renderScript(colors);
      queue.current = queue.current
        .then(async () => {
          if (!disposed) {
            await previewApi.action(pageId, {
              kind: "verify_revision",
              expected_revision: revision,
            });
            if (!disposed)
              await previewApi.action(pageId, { kind: "evaluate", expression });
          }
        })
        .catch((cause) => {
          if (!disposed) report(cause);
        });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => {
      disposed = true;
      observer.disconnect();
      queue.current = queue.current
        .then(() =>
          previewApi.action(pageId, {
            kind: "evaluate",
            expression: annotationMarkersScript(revision, [], {
              background: "",
              foreground: "",
            }),
          }),
        )
        .then(() => {})
        .catch(() => {});
    };
  }, [pageId, revision, geometry, active, hasMarkers, address]);
}
