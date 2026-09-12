import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { createSpreadsheetReader } from "./spreadsheetReader.js";

async function file() {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet("Schedule");
  sheet.addRow(["Week", "Lecture topics"]);
  sheet.getCell("A1").font = { bold: true };
  book.addWorksheet("Exams").addRow(["Exam dates"]);
  return new Blob([await book.xlsx.writeBuffer()]);
}
function resultReader(options) {
  let resolve, reject;
  const done = new Promise((yes, no) => { resolve = yes; reject = no; });
  const reader = createSpreadsheetReader({ onResult: resolve, onError: message => reject(Error(message)), ...options });
  return { reader, done };
}
test("unavailable workers automatically open the original styled file without user action", async () => {
  const { reader, done } = resultReader({ workerFactory: () => { throw Error("Worker unavailable"); } });
  await reader.open(file(), "schedule.xlsx");
  const result = await done;
  assert.equal(result.page.rows[0].cells[0].style.fontWeight, "700");
  assert.equal(result.sheets.length, 2);
  reader.dispose();
});
test("startup errors after a buffer transfer recover and preserve subsequent worksheet navigation", async () => {
  let worker, terminated = 0, next;
  const { reader, done } = resultReader({ workerFactory: () => (worker = { postMessage(data, transfer) { structuredClone(data, { transfer }); queueMicrotask(() => worker.onerror?.({ preventDefault() {} })); }, terminate() { terminated++; } }), onResult: result => next?.(result) });
  // The fallback must use the retained Blob, because this worker detaches bytes.
  let resolve; const loaded = new Promise(yes => { resolve = yes; }); next = resolve;
  await reader.open(file(), "schedule.xlsx");
  const first = await loaded;
  assert.equal(first.page.rows[0].cells[1].text, "Lecture topics");
  assert.equal(terminated, 1);
  let second;
  next = result => { second = result; };
  reader.navigate({ sheetIndex: 1 });
  assert.equal(second.page.rows[0].cells[0].text, "Exam dates");
  reader.dispose(); void done;
});
test("a stalled worker automatically recovers once instead of leaving an endless loading state", async () => {
  let expire, fallbacks = 0;
  const { reader, done } = resultReader({ workerFactory: () => ({ postMessage() {}, terminate() {} }), setTimer: callback => { expire = callback; return 1; }, clearTimer() {}, loadFallback: async () => {
    fallbacks++;
    const [style, pages] = await Promise.all([import("./spreadsheetStyles.js"), import("./spreadsheet.js")]); return { ...style, ...pages };
  } });
  await reader.open(file(), "schedule.xlsx");
  expire(); expire();
  assert.equal((await done).page.rows[0].cells[0].text, "Week");
  assert.equal(fallbacks, 1); reader.dispose();
});
test("navigating away cancels fallback delivery and download errors do not trigger another file read", async () => {
  let finish, calls = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const reader = createSpreadsheetReader({ workerFactory: () => { throw Error("Blocked"); }, onResult: () => calls++, onError: () => calls++, loadFallback: () => pending });
  await reader.open(file(), "schedule.xlsx"); reader.dispose();
  finish({}); await Promise.resolve(); assert.equal(calls, 0);
  let created = 0, error;
  const failed = createSpreadsheetReader({ workerFactory: () => created++, onResult: () => assert.fail(), onError: message => { error = message; } });
  await failed.open(Promise.reject(Error("Canvas permission denied")), "schedule.xlsx");
  assert.equal(error, "Canvas permission denied"); assert.equal(created, 0); failed.dispose();
});
