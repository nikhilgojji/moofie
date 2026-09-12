import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import ExcelJS from "exceljs";

// Exercise Vite's actual browser bundle, including ExcelJS's browser build.
const assets = new URL("../dist/assets/", import.meta.url);
const workerName = (await readdir(assets)).find(name => /^spreadsheet\.worker-.*\.js$/.test(name));
assert.ok(workerName, "Build the app before checking the preview worker.");
let result;
// A browser worker has no Node process/Buffer, DOM window/document, or permission
// to evaluate strings under the deployed Content-Security-Policy.
const worker = createContext({ console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, TextEncoder, TextDecoder, Blob, atob, btoa,
  importScripts: () => { throw Error("importScripts is unavailable in module workers"); },
  postMessage: value => { result = value; } }, { codeGeneration: { strings: false, wasm: false } });
runInContext("self = globalThis", worker);
try { runInContext(await readFile(new URL(workerName, assets), "utf8"), worker, { timeout: 5000 }); }
catch (error) { console.error(`Browser-worker startup failed: ${error.name}: ${error.message}`); process.exit(1); }
const book = new ExcelJS.Workbook(), sheet = book.addWorksheet("Schedule");
sheet.headerFooter.oddHeader = "&L&BSchedule title";
sheet.addRow(["Week", "Topic"]);
sheet.getCell("A1").font = { bold: true, size: 14 };
sheet.getCell("A1").border = { bottom: { style: "thick" } };
sheet.getCell("A101").value = "Last row";
book.addWorksheet("Exams").addRow(["Exam dates"]);
const binary = await book.xlsx.writeBuffer();
const bytes = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
worker.input = Array.from(new Uint8Array(bytes));
const workerBytes = runInContext("Uint8Array.from(input).buffer", worker);
await worker.onmessage({ data: { bytes: workerBytes, fileName: "schedule.xlsx", requestId: 1 } });
assert.equal(result.error, undefined);
assert.equal(result.page.styleWarning, undefined);
assert.equal(result.page.header.left[0].text, "Schedule title");
assert.equal(result.page.rows[0].cells[0].style.fontWeight, "700");
assert.equal(result.page.rows[0].cells[0].style.borderBottom, "3px solid #000000");
assert.equal(result.sheets.length, 2);
await worker.onmessage({ data: { rowStart: 100, requestId: 2 } });
assert.equal(result.page.rows[0].cells[0].text, "Last row");
await worker.onmessage({ data: { sheetIndex: 1, requestId: 3 } });
assert.equal(result.page.rows[0].cells[0].text, "Exam dates");
console.log("Built spreadsheet worker preserves formatting, headers, and row navigation.");
