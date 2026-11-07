import { useEffect, useRef, useState } from "react";
import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ImageData } from "./api";
import { clampZoom, imageLayout, MAX_ZOOM, MIN_ZOOM } from "./imageZoom";
import "./image-preview.css";

export function ImageSurface({
  image,
  path,
  onExpand,
}: {
  image: ImageData;
  path: string;
  onExpand?: () => void;
}) {
  const { t } = useTranslation();
  const surface = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  }>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    const measure = () =>
      setSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1);
      setZoom((value) =>
        clampZoom(
          value * Math.exp(-Math.max(-200, Math.min(200, delta)) / 300),
        ),
      );
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      node.removeEventListener("wheel", wheel);
    };
  }, []);
  const layout =
    dimensions && size.width && size.height
      ? imageLayout(
          dimensions.width,
          dimensions.height,
          size.width,
          size.height,
          zoom,
        )
      : undefined;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        ref={surface}
        className="min-h-0 flex-1 overflow-auto bg-bg-secondary"
      >
        {failed ? (
          <p role="alert" className="p-6 text-sm text-danger">
            {t("imagePreview.failed")}
          </p>
        ) : (
          <div className="flex h-max min-h-full w-max min-w-full items-center justify-center p-4">
            <img
              src={image.url}
              alt={path}
              draggable={false}
              className="image-preview-checker block max-w-none object-contain"
              style={
                layout || {
                  maxWidth: size.width ? size.width - 32 : "100%",
                  maxHeight: size.height ? size.height - 32 : "100%",
                }
              }
              onLoad={(event) =>
                setDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              onError={() => setFailed(true)}
            />
          </div>
        )}
      </div>
      <div
        role="toolbar"
        aria-label={t("imagePreview.controls")}
        className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border-subtle px-3 py-1 text-xs text-muted"
      >
        <button
          type="button"
          className="app-button-ghost p-1"
          aria-label={t("imagePreview.zoomOut")}
          title={t("imagePreview.zoomOut")}
          disabled={failed || zoom <= MIN_ZOOM}
          onClick={() => setZoom(clampZoom(zoom / 1.25))}
        >
          <ZoomOut size={14} />
        </button>
        <button
          type="button"
          className="app-button-ghost p-1"
          aria-label={t("imagePreview.resetZoom")}
          title={t("imagePreview.resetZoom")}
          disabled={failed || zoom === 1}
          onClick={() => setZoom(1)}
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          className="app-button-ghost p-1"
          aria-label={t("imagePreview.zoomIn")}
          title={t("imagePreview.zoomIn")}
          disabled={failed || zoom >= MAX_ZOOM}
          onClick={() => setZoom(clampZoom(zoom * 1.25))}
        >
          <ZoomIn size={14} />
        </button>
        <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
        {dimensions && (
          <span>
            {dimensions.width} × {dimensions.height}
          </span>
        )}
        <span>
          {image.bytes < 1024
            ? `${image.bytes} B`
            : image.bytes < 1024 * 1024
              ? `${(image.bytes / 1024).toFixed(1)} KiB`
              : `${(image.bytes / (1024 * 1024)).toFixed(1)} MiB`}
        </span>
        {onExpand && (
          <button
            type="button"
            className="app-button-ghost ml-auto p-1"
            aria-label={t("imagePreview.expand")}
            title={t("imagePreview.expand")}
            onClick={onExpand}
          >
            <Maximize2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
