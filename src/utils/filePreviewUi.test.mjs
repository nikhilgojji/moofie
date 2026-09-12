import test, { after } from "node:test";
import assert from "node:assert/strict";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import { JSDOM } from "jsdom";
import { utils, write } from "xlsx";
import { readWorkbook, sheetPage } from "./spreadsheet.js";

const dom = new JSDOM('<div id="root"></div>', { url: "https://moofie.example" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const fixture = new URL(`.file-preview-ui-${process.pid}.fixture.mjs`, import.meta.url);
const bundle = await rolldown({
  input: "preview-test-entry", external: id => /^react(?:\/|$)/.test(id), transform: { jsx: "react-jsx" },
  plugins: [{ name: "preview-test", resolveId(id) {
    if (id === "preview-test-entry") return "\0preview-test-entry";
    if (id.endsWith("/canvasApi")) return "\0preview-test-api";
  }, load(id) {
    if (id === "\0preview-test-entry") return `export * from ${JSON.stringify(fileURLToPath(new URL("../components/FilePreview.jsx", import.meta.url)))};`;
    if (id === "\0preview-test-api") return "export const loadCourseFilePreview = (...args) => globalThis.previewRequest(...args); export const loadCourseFile = (...args) => globalThis.fileRequest(...args);";
  } }],
});
const generated = await bundle.generate({ format: "esm", codeSplitting: false });
await writeFile(fixture, generated.output[0].code);
await bundle.close();
const { FilePreview, useFilePreview } = await import(fixture.href);
const root = createRoot(document.getElementById("root"));
after(async () => { await act(async () => root.unmount()); dom.window.close(); await unlink(fixture); });
function Viewer({ file }) {
  const preview = useFilePreview(39, file);
  return createElement(FilePreview, { file, preview, courseId: 39, PdfPreview: () => createElement("p", null, "PDF viewer") });
}
const session = "https://canvadocs.instructure.com/1/sessions/test/view";

test("Office files load the embedded Canvas preview; retry creates a new session", async () => {
  let attempts = 0;
  globalThis.fileRequest = () => assert.fail("Office preview should not download the workbook first");
  globalThis.previewRequest = async (courseId, id) => {
    assert.equal(courseId, 39); assert.equal(id, 12);
    if (++attempts === 1) throw Error("Session expired");
    return { previewUrl: session };
  };
  await act(async () => root.render(createElement(Viewer, { file: { id: 12, name: "Schedule.docx" } })));
  assert.match(document.querySelector('[role="alert"]').textContent, /Session expired/);
  await act(async () => document.querySelector("button").click());
  assert.equal(attempts, 2);
  const frame = document.querySelector("iframe");
  assert.equal(frame.src, session);
  assert.equal(frame.title, "Schedule.docx");
  assert.ok(!frame.sandbox?.contains("allow-top-navigation"));
  await act(async () => frame.dispatchEvent(new dom.window.Event("load")));
  assert.equal(document.querySelector('[role="status"]'), null);
});

test("the reported missing-preview regression automatically renders the actual Canvas workbook", async () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([["Tentative 141 Schedule"], ["Week 1", "Integrals"]]), "Schedule");
  globalThis.previewRequest = async () => ({ previewUrl: null });
  globalThis.fileRequest = async () => new Blob([write(workbook, { type: "array", bookType: "xlsx" })]);
  globalThis.Worker = class {
    postMessage(data) { if (data.bytes) this.book = readWorkbook(data.bytes); queueMicrotask(() => this.onmessage?.({ data: { requestId: data.requestId, names: this.book.SheetNames, page: sheetPage(this.book, data.sheetIndex, data.rowStart, data.colStart) } })); }
    terminate() { this.onmessage = null; }
  };
  await act(async () => root.render(createElement(Viewer, { file: { id: 51, name: "Tentative 141 Schedule F2026.xlsx" } })));
  assert.match(document.querySelector("table").textContent, /Tentative 141 Schedule.*Week 1.*Integrals/);
  assert.equal(document.querySelector("select").textContent, "Schedule");
  assert.doesNotMatch(document.body.textContent, /no preview available/);
});

test("switching files discards an unfinished old preview and never shows it for the new file", async () => {
  let finishOld;
  globalThis.previewRequest = (course, id) => id === 13 ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve({ previewUrl: session + "?file=new" });
  await act(async () => root.render(createElement(Viewer, { file: { id: 13, name: "Old.docx" } })));
  assert.ok(document.querySelector('[role="status"]'));
  await act(async () => root.render(createElement(Viewer, { file: { id: 14, name: "New.pptx" } })));
  await act(async () => finishOld({ previewUrl: session + "?file=old" }));
  assert.equal(document.querySelector("iframe").src, session + "?file=new");
  assert.equal(document.querySelector("iframe").title, "New.pptx");
});

test("HTML is sandboxed; plain text is escaped; media has native playback controls", async () => {
  await act(async () => root.render(createElement(FilePreview, { file: { name: "page.html" }, preview: { kind: "html", url: "blob:html" } })));
  assert.equal(document.querySelector("iframe").getAttribute("sandbox"), "");
  await act(async () => root.render(createElement(FilePreview, { file: { name: "notes.txt" }, preview: { kind: "text", text: "<script>bad()</script>" } })));
  assert.equal(document.querySelector("script"), null);
  assert.match(document.querySelector("pre").textContent, /<script>/);
  for (const kind of ["audio", "video"]) {
    await act(async () => root.render(createElement(FilePreview, { file: { name: "lecture" }, preview: { kind, url: "blob:media" } })));
    assert.ok(document.querySelector(kind).controls);
  }
});
