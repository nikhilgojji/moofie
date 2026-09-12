import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { readStyledWorkbook, printText } from "./spreadsheetStyles.js";
import { sheetPage } from "./spreadsheet.js";

test("formatted XLSX round-trip keeps print titles, fonts, borders, alignment and original dimensions", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Schedule");
  sheet.headerFooter.oddHeader = '&L&"Calibri,Bold"&14MATH 11&C&"Calibri,Bold"&14Schedule - Fall 2026';
  sheet.headerFooter.oddFooter = "&RPage &P of &N";
  sheet.columns = [{ width: 8 }, { width: 12 }, { width: 50 }];
  sheet.addRow(["Week", "Date", "Lecture topics"]);
  sheet.addRow([1, new Date(Date.UTC(2026, 7, 26)), "Syllabus, Row and Column pictures"]);
  sheet.addRow([null, "28-Aug", { richText: [{ text: "Midterm ", font: { bold: true } }, { text: "1" }] }]);
  sheet.mergeCells("A2:A3");
  sheet.getRow(2).height = 30;
  sheet.getCell("B2").numFmt = "d-mmm";
  sheet.getRow(1).eachCell(cell => {
    cell.font = { name: "Calibri", size: 11, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thick", color: { argb: "FF000000" } }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  const bytes = await book.xlsx.writeBuffer();
  const decoded = await readStyledWorkbook(bytes, "schedule.xlsx");
  const page = sheetPage(decoded);
  assert.equal(page.header.left[0].text, "MATH 11");
  assert.equal(page.header.center[0].text, "Schedule - Fall 2026");
  assert.equal(page.header.center[0].style.fontWeight, "700");
  assert.equal(page.rows[0].cells[0].style.borderTop, "3px solid #000000");
  assert.equal(page.rows[0].cells[0].style.borderBottom, "2px solid #000000");
  assert.equal(page.rows[0].cells[0].style.textAlign, "center");
  assert.equal(page.rows[0].cells[0].style.verticalAlign, "middle");
  assert.equal(page.rows[0].cells[0].style.fontSize, "11pt");
  assert.equal(page.rows[1].height, 40);
  assert.equal(page.columnWidths[2], 355);
  assert.equal(page.rows[1].cells[0].rowSpan, 2);
  assert.equal(page.rows[1].cells[1].text, "26-Aug");
  assert.equal(page.rows[2].cells[1].runs[0].text, "Midterm ");
  assert.equal(page.rows[2].cells[1].runs[0].style.fontWeight, "700");
  assert.match(page.footer.right.map(run => run.text).join(""), /Page 1 of 1/);
});

test("header formatting keeps literal text separate from styling and does not produce HTML", () => {
  assert.deepEqual(printText(null), { left: [], center: [], right: [] });
  const header = printText('&L<B> & <script>alert(1)</script>&C&KFF0000&12&BSchedule && Policy');
  assert.equal(header.left.map(run => run.text).join(""), "<B>  <script>alert(1)</script>");
  assert.equal(header.center[0].text, "Schedule & Policy");
  assert.equal(header.center[0].style.color, "#FF0000");
  assert.equal(header.center[0].style.fontSize, "12pt");
});
