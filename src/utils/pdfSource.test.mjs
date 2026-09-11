import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { pdfErrorMessage, readPdfBytes } from "./pdfSource.js";

function samplePdf() {
  const stream = "BT /F1 12 Tf 30 100 Td (Moofie PDF test) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

test("downloaded bytes open with the installed PDF.js parser", async () => {
  const bytes = await readPdfBytes(samplePdf());
  const task = getDocument({ data: bytes, isEvalSupported: false });
  try {
    const document = await task.promise;
    assert.equal(document.numPages, 1);
    const page = await document.getPage(1);
    assert.equal(page.getViewport({ scale: 1 }).width, 300);
    assert.equal(page.getViewport({ scale: 1 }).height, 200);
    const text = await page.getTextContent();
    assert.equal(text.items[0].str, "Moofie PDF test");
  } finally { await task.destroy(); }
});

test("retry gets intact bytes after the original buffer is transferred", async () => {
  const blob = samplePdf();
  const first = await readPdfBytes(blob);
  structuredClone(first.buffer, { transfer: [first.buffer] });
  assert.equal(first.byteLength, 0);
  const retry = await readPdfBytes(blob);
  const task = getDocument({ data: retry, isEvalSupported: false });
  try { assert.equal((await task.promise).numPages, 1); }
  finally { await task.destroy(); }
});

test("empty downloads and HTML responses produce actionable errors", async () => {
  await assert.rejects(readPdfBytes(new Blob([])), /empty file/);
  await assert.rejects(readPdfBytes(new Blob(["<html>Login required</html>"])), /not a PDF/);
  assert.match(pdfErrorMessage({ name: "PasswordException" }), /password-protected/);
  assert.match(pdfErrorMessage({ name: "InvalidPDFException" }), /damaged or incomplete/);
});

test("compatibility API and worker start without newer browser built-ins and render a page", async () => {
  const bytes = await readPdfBytes(samplePdf());
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    delete Map.prototype.getOrInsertComputed;
    delete WeakMap.prototype.getOrInsertComputed;
    delete Promise.try;
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    GlobalWorkerOptions.workerSrc = new URL('./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'file://' + process.cwd().replaceAll('\\\\', '/') + '/').href;
    const task = getDocument({ data: new Uint8Array(${JSON.stringify([...bytes])}), isEvalSupported: false });
    try {
      const pdf = await task.promise;
      if (pdf.numPages !== 1) throw new Error('Unexpected page count');
      await (await pdf.getPage(1)).getOperatorList();
      console.log('Compatibility worker loaded and prepared page');
    } finally { await task.destroy(); }
  `], { encoding: "utf8", timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /Compatibility worker loaded/);

  const require = createRequire(import.meta.url);
  const fontDir = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').replaceAll('\\', '/') + '/';
  const task = getDocument({ data: await readPdfBytes(samplePdf()), isEvalSupported: false, standardFontDataUrl: fontDir });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    assert.ok(pixels.some((value, index) => index % 4 !== 3 && value < 100), 'Page contains rendered text');
  } finally { await task.destroy(); }
});
