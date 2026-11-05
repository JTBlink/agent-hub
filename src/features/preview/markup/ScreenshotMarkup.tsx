import {
  ArrowUpRight,
  Circle,
  Highlighter,
  PenTool,
  RectangleHorizontal,
  Redo2,
  Trash2,
  Type,
  Undo2,
  X,
  Check,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "../../../components/ThemedSelect";
import {
  commitShapes,
  drawShape,
  emptyHistory,
  imagePoint,
  redo,
  undo,
  type MarkupShape,
  type MarkupTool,
  type Point,
} from "./model";
export interface MarkupBase {
  data: string;
  width: number;
  height: number;
}
const tools = [
  { id: "pen", Icon: PenTool },
  { id: "highlight", Icon: Highlighter },
  { id: "arrow", Icon: ArrowUpRight },
  { id: "rect", Icon: RectangleHorizontal },
  { id: "ellipse", Icon: Circle },
  { id: "text", Icon: Type },
] as const;
const inks = ["danger", "accent", "warning", "success", "text-primary"];

export function ScreenshotMarkup({
  base,
  busy,
  onApply,
  onCancel,
}: {
  base: MarkupBase;
  busy: boolean;
  onApply: (data: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [history, setHistory] = useState(emptyHistory);
  const [tool, setTool] = useState<MarkupTool>("pen");
  const [ink, setInk] = useState("danger");
  const [width, setWidth] = useState("4");
  const [draft, setDraft] = useState<MarkupShape | null>(null);
  const [text, setText] = useState<{ at: Point; value: string } | null>(null);
  const [error, setError] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    const measure = (width: number, height: number) => {
      const scale = Math.max(
        0,
        Math.min(width / base.width, height / base.height),
      );
      setFit({ width: base.width * scale, height: base.height * scale });
    };
    const style = getComputedStyle(node);
    measure(
      node.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
      node.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom),
    );
    const observer = new ResizeObserver(([entry]) => {
      measure(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(node);
    canvas.current?.focus();
    return () => observer.disconnect();
  }, [base.width, base.height]);
  const render = () => {
    const element = canvas.current,
      source = image.current;
    if (!element || !source?.complete || !source.naturalWidth) return;
    const context = element.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, base.width, base.height);
    context.drawImage(source, 0, 0, base.width, base.height);
    for (const shape of [...history.shapes, ...(draft ? [draft] : [])])
      drawShape(context, shape);
  };
  useEffect(render);
  const shape = (points: Point[], value?: string): MarkupShape => ({
    id: crypto.randomUUID(),
    tool,
    points,
    width:
      (Number(width) * base.width) /
      (canvas.current?.getBoundingClientRect().width || base.width),
    color: getComputedStyle(document.documentElement)
      .getPropertyValue(`--color-${ink}`)
      .trim(),
    text: value,
  });
  const point = (event: React.PointerEvent) =>
    imagePoint(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
      base.width,
      base.height,
    );
  const commitText = () => {
    if (text?.value.trim())
      setHistory((previous) =>
        commitShapes(previous, [
          ...previous.shapes,
          shape([text.at], text.value),
        ]),
      );
    setText(null);
  };
  const apply = async () => {
    try {
      render();
      const data = canvas.current!.toDataURL("image/png").split(",")[1];
      if (data.length > 3 * 1024 * 1024)
        throw new Error(t("preview.captureLimit"));
      await onApply(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <section
      className="preview-markup"
      aria-label={t("preview.drawScreenshot")}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (text) setText(null);
          else onCancel();
        }
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "z" &&
          !text
        ) {
          event.preventDefault();
          setHistory(event.shiftKey ? redo : undo);
        }
      }}
    >
      <div
        className="preview-markup-toolbar"
        role="toolbar"
        aria-label={t("preview.drawScreenshot")}
      >
        {tools.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            disabled={busy || !!text}
            aria-label={t(`preview.markupTool.${id}`)}
            title={t(`preview.markupTool.${id}`)}
            aria-pressed={tool === id}
            onClick={() => setTool(id)}
          >
            <Icon size={16} />
          </button>
        ))}
        <ThemedSelect
          aria-label={t("preview.markupColor")}
          value={ink}
          disabled={busy}
          onChange={(event) => setInk(event.target.value)}
        >
          {inks.map((value) => (
            <option key={value} value={value}>
              {t(`preview.markupInk.${value}`)}
            </option>
          ))}
        </ThemedSelect>
        <ThemedSelect
          aria-label={t("preview.markupWidth")}
          value={width}
          disabled={busy}
          onChange={(event) => setWidth(event.target.value)}
        >
          {[2, 4, 8].map((value) => (
            <option key={value} value={value}>
              {value} px
            </option>
          ))}
        </ThemedSelect>
        <button
          disabled={busy || !history.past.length || !!text}
          aria-label={t("preview.markupUndo")}
          title={t("preview.markupUndo")}
          onClick={() => setHistory(undo)}
        >
          <Undo2 size={16} />
        </button>
        <button
          disabled={busy || !history.future.length || !!text}
          aria-label={t("preview.markupRedo")}
          title={t("preview.markupRedo")}
          onClick={() => setHistory(redo)}
        >
          <Redo2 size={16} />
        </button>
        <button
          disabled={busy || !history.shapes.length}
          aria-label={t("preview.markupClear")}
          title={t("preview.markupClear")}
          onClick={() => setHistory((previous) => commitShapes(previous, []))}
        >
          <Trash2 size={16} />
        </button>
        <button
          disabled={busy || !!draft || !!text}
          className="app-button-primary"
          onClick={() => void apply()}
        >
          <Check size={14} />
          {t("preview.useDrawing")}
        </button>
        <button
          disabled={busy}
          aria-label={t("common.cancel")}
          title={t("common.cancel")}
          onClick={onCancel}
        >
          <X size={16} />
        </button>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <div className="preview-markup-stage" ref={stage}>
        <img
          ref={image}
          hidden
          src={`data:image/png;base64,${base.data}`}
          onLoad={render}
          alt=""
        />
        <div
          className="preview-markup-image"
          style={{ width: fit.width, height: fit.height }}
        >
          <canvas
            ref={canvas}
            width={base.width}
            height={base.height}
            tabIndex={0}
            aria-label={t("preview.markupCanvas")}
            onPointerDown={(event) => {
              if (busy || text) return;
              if (history.shapes.length >= 100) {
                setError(t("preview.markupLimit"));
                return;
              }
              setError("");
              event.preventDefault();
              event.currentTarget.focus();
              const start = point(event);
              if (tool === "text") {
                setText({ at: start, value: "" });
                return;
              }
              event.currentTarget.setPointerCapture(event.pointerId);
              setDraft(shape([start, start]));
            }}
            onPointerMove={(event) => {
              if (!draft || busy) return;
              const next = point(event);
              setDraft((previous) =>
                previous
                  ? {
                      ...previous,
                      points: ["pen", "highlight"].includes(previous.tool)
                        ? [
                            ...(previous.points.length >= 1000
                              ? previous.points.filter(
                                  (_, index) => index % 2 === 0,
                                )
                              : previous.points),
                            next,
                          ]
                        : [previous.points[0], next],
                    }
                  : null,
              );
            }}
            onPointerUp={(event) => {
              if (!draft) return;
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
              setHistory((previous) =>
                commitShapes(previous, [...previous.shapes, draft]),
              );
              setDraft(null);
            }}
            onPointerCancel={() => setDraft(null)}
          />
          {text && (
            <input
              autoFocus
              maxLength={300}
              className="preview-markup-text app-input"
              style={{
                left: `${(text.at.x / base.width) * 100}%`,
                top: `${(text.at.y / base.height) * 100}%`,
                fontSize: `${Number(width) * 5}px`,
              }}
              value={text.value}
              aria-label={t("preview.markupTool.text")}
              onChange={(event) =>
                setText({ ...text, value: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitText();
                }
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setText(null);
                }
              }}
              onBlur={commitText}
            />
          )}
        </div>
      </div>
    </section>
  );
}
