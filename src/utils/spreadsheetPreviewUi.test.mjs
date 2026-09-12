import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import { JSDOM } from "jsdom";
import ExcelJS from "exceljs";
import { readStyledWorkbook } from "./spreadsheetStyles.js";
import { sheetPage, workbookSheets } from "./spreadsheet.js";

test("the rendered spreadsheet uses source formatting and print headers instead of a generic data grid", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet("Schedule");
  sheet.headerFooter.oddHeader = '&L&"Calibri,Bold"&14MATH 11&CSchedule - Fall 2026';
  sheet.columns = [{ width: 8 }, { width: 45 }];
  sheet.addRow(["Week", "Lecture topics"]); sheet.addRow([1, "Row and Column pictures"]);
  sheet.getCell("A1").style = { font: { bold: true, size: 11 }, alignment: { horizontal: "center", vertical: "middle" }, border: { bottom: { style: "thick" } } };
  sheet.getRow(2).height = 28;
  book.addWorksheet("Exams").addRow(["Exam dates"]);
  const sourceBlob = new Blob([await book.xlsx.writeBuffer()]);
  let complete;
  const parsed = new Promise(resolve => { complete = resolve; });
  globalThis.Worker = class {
    async postMessage(data) {
      try { if (data.bytes) this.workbook = await readStyledWorkbook(data.bytes, data.fileName); const workbook = this.workbook; this.onmessage?.({ data: { requestId: data.requestId, names: workbook.SheetNames, sheets: workbookSheets(workbook), page: sheetPage(workbook, data.sheetIndex, data.rowStart, data.colStart) } }); }
      finally { complete(); }
    }
    terminate() { this.onmessage = null; }
  };
  const fixture = new URL(`.spreadsheet-ui-${process.pid}.fixture.mjs`, import.meta.url);
  const bundle = await rolldown({ input: fileURLToPath(new URL("../components/SpreadsheetPreview.jsx", import.meta.url)), external: id => /^react(?:\/|$)/.test(id), transform: { jsx: "react-jsx" }, plugins: [{ name: "no-network", resolveId(id) { if (id.endsWith("/canvasApi")) return "\0no-network"; }, load(id) { if (id === "\0no-network") return 'export function loadCourseFile() { throw Error("Must reuse the original file"); }'; } }] });
  const root = createRoot(document.getElementById("root"));
  try {
    const built = await bundle.generate({ format: "esm" }); await writeFile(fixture, built.output[0].code);
    const { default: Preview } = await import(fixture.href);
    await act(async () => root.render(createElement(Preview, { file: { id: 1, name: "schedule.xlsx" }, courseId: 1, sourceBlob })));
    await act(async () => { await parsed; });
    assert.match(document.querySelector(".spreadsheet-print-header").textContent, /MATH 11Schedule - Fall 2026/);
    const first = document.querySelector("td");
    assert.equal(first.style.fontWeight, "700"); assert.equal(first.style.borderBottomWidth, "3px");
    assert.equal(first.style.textAlign, "center"); assert.equal(first.style.verticalAlign, "middle");
    assert.equal(document.querySelector("thead"), null);
    assert.equal(document.querySelectorAll("col").length, 2);
    assert.doesNotMatch(document.querySelector(".moofie-pdf-toolbar").textContent, /Previous rows|Next rows|Worksheet/);
    assert.equal(document.querySelector("select"), null);
    const paper = document.querySelector(".spreadsheet-paper"), originalScale = paper.style.transform;
    await act(async () => document.querySelector('[aria-label="Zoom in"]').click());
    assert.notEqual(paper.style.transform, originalScale);
    await act(async () => document.querySelector('[title="Fit page width"]').click());
    assert.equal(paper.style.transform, originalScale);
    await act(async () => document.querySelector('[aria-label="Rotate clockwise"]').click());
    assert.match(paper.style.transform, /rotate\(90deg\)/);
    assert.ok(document.querySelector('[aria-label="Enter fullscreen"]'));
    await act(async () => document.querySelector('[aria-label="Next page"]').click());
    assert.equal(document.querySelector('[aria-label="Page number"]').value, "2");
    assert.match(document.querySelector("table").textContent, /Exam dates/);
    await act(async () => document.querySelector('[aria-label="Previous page"]').click());
    assert.match(document.querySelector("table").textContent, /Lecture topics/);
  } finally { await act(async () => root.unmount()); await bundle.close(); await unlink(fixture).catch(() => {}); dom.window.close(); }
});
