import test from "node:test";
import assert from "node:assert/strict";
import { spreadsheetPageLocation, documentPageTransform } from "./documentViewer.js";

test("document page navigation reaches every worksheet, row block and column block", () => {
  const sheets = [{ rows: 101, columns: 31 }, { rows: 54, columns: 8 }];
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => spreadsheetPageLocation(sheets, i + 1)), [
    { count: 5, number: 1, sheetIndex: 0, rowStart: 0, colStart: 0 },
    { count: 5, number: 2, sheetIndex: 0, rowStart: 0, colStart: 30 },
    { count: 5, number: 3, sheetIndex: 0, rowStart: 100, colStart: 0 },
    { count: 5, number: 4, sheetIndex: 0, rowStart: 100, colStart: 30 },
    { count: 5, number: 5, sheetIndex: 1, rowStart: 0, colStart: 0 },
  ]);
  assert.equal(spreadsheetPageLocation(sheets, 99).number, 5);
  assert.equal(spreadsheetPageLocation(sheets, -1).number, 1);
});
test("rotation reserves the whole scaled page and keeps all four orientations in view", () => {
  assert.deepEqual(documentPageTransform(800, 1200, 90, 0.5), { width: 600, height: 400, transform: "scale(0.5) translate(1200px, 0px) rotate(90deg)" });
  assert.equal(documentPageTransform(800, 1200, 180, 1).transform, "scale(1) translate(800px, 1200px) rotate(180deg)");
  assert.equal(documentPageTransform(800, 1200, 270, 1).transform, "scale(1) translate(0px, 800px) rotate(270deg)");
  assert.deepEqual(documentPageTransform(800, 1200, 360, 1), documentPageTransform(800, 1200, 0, 1));
});
