import test from "node:test";
import assert from "node:assert/strict";
import { utils, write } from "xlsx";
import { readWorkbook, sheetPage } from "./spreadsheet.js";

test("the fallback reads actual XLSX bytes, all worksheets, dates, cached formulas and merged cells", () => {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([["Math 141 Schedule", null], ["Date", "Topic"], [46269, "Integrals"], [2, 3]]);
  sheet.A3.z = "m/d/yyyy";
  sheet.C4 = { t: "n", f: "A4+B4", v: 5 };
  sheet["!ref"] = "A1:C4"; sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  utils.book_append_sheet(workbook, sheet, "Schedule"); utils.book_append_sheet(workbook, utils.aoa_to_sheet([["Exam dates"]]), "Exams");
  const decoded = readWorkbook(write(workbook, { type: "array", bookType: "xlsx" }));
  assert.deepEqual(decoded.SheetNames, ["Schedule", "Exams"]);
  const page = sheetPage(decoded);
  assert.equal(page.rows[0].cells[0].colSpan, 2);
  assert.match(page.rows[2].cells[0].text, /2026/);
  assert.equal(page.rows[3].cells[2].text, "5");
  assert.equal(sheetPage(decoded, 1).rows[0].cells[0].text, "Exam dates");
});

test("large sheets remain fully navigable with row and column pages", () => {
  const workbook = utils.book_new(), sheet = utils.aoa_to_sheet([["First"]]);
  sheet.A101 = { t: "s", v: "Row 101" }; sheet.AE101 = { t: "s", v: "Column 31" }; sheet["!ref"] = "A1:AE101";
  utils.book_append_sheet(workbook, sheet, "Large");
  assert.equal(sheetPage(workbook).rows.length, 100);
  assert.equal(sheetPage(workbook, 0, 100).rows[0].cells[0].text, "Row 101");
  assert.equal(sheetPage(workbook, 0, 100, 30).rows[0].cells[0].text, "Column 31");
  assert.throws(() => readWorkbook(new TextEncoder().encode("<html>Login page</html>").buffer), /not a readable/);
});
