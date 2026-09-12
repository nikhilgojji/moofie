import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("sync panel distinguishes course-list checks, pending pages, retries and restricted access", async () => {
  const fixture = new URL(`.sync-status-${process.pid}.fixture.mjs`, import.meta.url);
  const bundle = await rolldown({ input: "sync-status-test", external: id => /^react(?:\/|$)/.test(id), transform: { jsx: "react-jsx" }, plugins: [{ name: "sync-test", resolveId(id) { if (id === "sync-status-test") return "\0sync-status-test"; }, load(id) {
    if (id === "\0sync-status-test") return `export * from ${JSON.stringify(fileURLToPath(new URL("../components/SyncStatus.jsx", import.meta.url)))}; export * from ${JSON.stringify(fileURLToPath(new URL("./canvasSync.js", import.meta.url)))};`;
  } }] });
  try {
    const result = await bundle.generate({ format: "esm" });
    await writeFile(fixture, result.output[0].code);
    const { SyncStatus, updateCanvasCoverage, resetCanvasSync } = await import(fixture.href);
    updateCanvasCoverage(1, { status: "current", pages: 3, checkedPages: 1, failedPages: 1, restrictedPages: 1 });
    updateCanvasCoverage(2, { status: "partial", pages: 0, checkedPages: 0, failedPages: 0, restrictedPages: 0 });
    const html = renderToStaticMarkup(createElement(SyncStatus, { courses: [{ id: 1, name: "Math" }, { id: 2, name: "History" }] }));
    assert.match(html, /1 of 2 course lists checked/); assert.match(html, /1 of 3 discovered pages/);
    assert.match(html, /page loads retrying/); assert.match(html, /pages unavailable in Canvas/);
    assert.match(html, /File previews and external tools are checked when opened/);
    resetCanvasSync();
    const signedOut = renderToStaticMarkup(createElement(SyncStatus, { courses: [{ id: 3, name: "New account" }] }));
    assert.doesNotMatch(signedOut, /Math|History/); assert.match(signedOut, /Waiting to check/);
  } finally { await bundle.close(); await unlink(fixture).catch(() => {}); }
});
