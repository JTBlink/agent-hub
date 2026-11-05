import { expect, it } from "vitest";
import {
  commitShapes,
  emptyHistory,
  imagePoint,
  redo,
  undo,
  type MarkupShape,
} from "./model";

const mark: MarkupShape = {
  id: "one",
  tool: "rect",
  color: "red",
  width: 2,
  points: [
    { x: 1, y: 2 },
    { x: 10, y: 20 },
  ],
};
it("maps scaled screenshot coordinates and clamps strokes to the image", () => {
  const bounds = { left: 10, top: 20, width: 200, height: 100 };
  expect(imagePoint({ x: 110, y: 70 }, bounds, 800, 400)).toEqual({
    x: 400,
    y: 200,
  });
  expect(imagePoint({ x: -10, y: 200 }, bounds, 800, 400)).toEqual({
    x: 0,
    y: 400,
  });
});
it("restores drawings after clear and discards redo after new input", () => {
  const drawn = commitShapes(emptyHistory(), [mark]);
  const cleared = commitShapes(drawn, []);
  expect(undo(cleared).shapes).toEqual([mark]);
  expect(redo(undo(cleared)).shapes).toEqual([]);
  expect(commitShapes(undo(cleared), [mark]).future).toEqual([]);
  expect(emptyHistory().shapes).toEqual([]);
});
it("bounds undo history while retaining the current drawing", () => {
  let history = emptyHistory();
  for (let i = 0; i < 100; i++)
    history = commitShapes(history, [{ ...mark, id: String(i) }]);
  expect(history.past).toHaveLength(50);
  expect(history.shapes[0].id).toBe("99");
});
