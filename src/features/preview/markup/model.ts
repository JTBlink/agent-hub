export type MarkupTool =
  "pen" | "highlight" | "arrow" | "rect" | "ellipse" | "text";
export interface Point {
  x: number;
  y: number;
}
export interface MarkupShape {
  id: string;
  tool: MarkupTool;
  points: Point[];
  color: string;
  width: number;
  text?: string;
}
export interface MarkupHistory {
  shapes: MarkupShape[];
  past: MarkupShape[][];
  future: MarkupShape[][];
}
export const emptyHistory = (): MarkupHistory => ({
  shapes: [],
  past: [],
  future: [],
});
export function commitShapes(
  history: MarkupHistory,
  shapes: MarkupShape[],
): MarkupHistory {
  return {
    shapes,
    past: [...history.past.slice(-49), history.shapes],
    future: [],
  };
}
export function undo(history: MarkupHistory): MarkupHistory {
  const shapes = history.past.at(-1);
  return shapes
    ? {
        shapes,
        past: history.past.slice(0, -1),
        future: [history.shapes, ...history.future],
      }
    : history;
}
export function redo(history: MarkupHistory): MarkupHistory {
  const shapes = history.future[0];
  return shapes
    ? {
        shapes,
        past: [...history.past, history.shapes],
        future: history.future.slice(1),
      }
    : history;
}
export function imagePoint(
  client: Point,
  bounds: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): Point {
  return {
    x: Math.max(
      0,
      Math.min(width, ((client.x - bounds.left) * width) / (bounds.width || 1)),
    ),
    y: Math.max(
      0,
      Math.min(
        height,
        ((client.y - bounds.top) * height) / (bounds.height || 1),
      ),
    ),
  };
}
export function drawShape(
  context: CanvasRenderingContext2D,
  shape: MarkupShape,
) {
  const first = shape.points[0],
    last = shape.points.at(-1);
  if (!first || !last) return;
  context.save();
  context.strokeStyle = context.fillStyle = shape.color;
  context.lineWidth = shape.width;
  context.lineCap = context.lineJoin = "round";
  context.beginPath();
  if (shape.tool === "text") {
    context.textBaseline = "top";
    context.font = `${shape.width * 5}px system-ui, sans-serif`;
    context.fillText(shape.text ?? "", first.x, first.y);
  } else if (shape.tool === "rect") {
    context.strokeRect(first.x, first.y, last.x - first.x, last.y - first.y);
  } else if (shape.tool === "ellipse") {
    context.ellipse(
      (first.x + last.x) / 2,
      (first.y + last.y) / 2,
      Math.abs(last.x - first.x) / 2,
      Math.abs(last.y - first.y) / 2,
      0,
      0,
      2 * Math.PI,
    );
    context.stroke();
  } else {
    if (shape.tool === "highlight") {
      context.globalAlpha = 0.35;
      context.lineWidth *= 4;
    }
    context.moveTo(first.x, first.y);
    for (const point of shape.points.slice(1)) context.lineTo(point.x, point.y);
    if (shape.tool === "arrow") {
      const angle = Math.atan2(last.y - first.y, last.x - first.x),
        size = shape.width * 4;
      context.moveTo(
        last.x - size * Math.cos(angle - Math.PI / 6),
        last.y - size * Math.sin(angle - Math.PI / 6),
      );
      context.lineTo(last.x, last.y);
      context.lineTo(
        last.x - size * Math.cos(angle + Math.PI / 6),
        last.y - size * Math.sin(angle + Math.PI / 6),
      );
    }
    context.stroke();
  }
  context.restore();
}
