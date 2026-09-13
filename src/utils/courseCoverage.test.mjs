import test from "node:test";
import assert from "node:assert/strict";
import { startCourseCoverage } from "./courseCoverage.js";
import { createRequestCache } from "./requestCache.js";
import { compareCanvasCollections, compareCanvasCourse } from "../../supabase/functions/canvas/courseAudit.ts";

function harness(options = {}) {
  const target = new EventTarget(), doc = new EventTarget();
  let tick, time = 1;
  target.navigator = { onLine: true };
  target.setInterval = fn => { tick = fn; return 1; }; target.clearInterval = () => {};
  doc.visibilityState = "visible";
  const reports = new Map();
  const stop = startCourseCoverage({ courses: [{ id: 1, name: "Math" }, { id: 2, name: "History" }], target, doc, now: () => time, report: (id, result) => reports.set(id, result), ...options });
  return { tick: () => tick(), target, doc, stop, reports, advance: ms => { time += ms; } };
}
function resources(id, partial = false) {
  return { course: { name: "Course" }, pages: [{ pageUrl: `page-${id}` }], modules: [{ items: [{ type: "Page", pageUrl: `page-${id}` }, { type: "ExternalTool", contentId: 123 }] }], _sync: { checks: { pages: { matched: true } }, checkedAt: "2026-09-12T12:00:00Z", partial } };
}

test("background checks discover every enrolled course and deduplicate module pages without launching tools", async () => {
  const calls = [], saved = [];
  const run = harness({ readResources: async id => { calls.push(`course-${id}`); return resources(id); }, readPage: async (id, slug) => { calls.push(slug); return { title: "Page", body: "<table>Original Canvas HTML</table>" }; }, onResources: id => saved.push(id) });
  for (let i = 0; i < 6; i++) await run.tick();
  assert.deepEqual(calls, ["course-1", "course-2", "page-1", "page-2"]);
  assert.deepEqual(saved, [1, 2]);
  for (const report of run.reports.values()) { assert.equal(report.status, "current"); assert.equal(report.pages, 1); assert.equal(report.checkedPages, 1); assert.equal("body" in report, false); }
  run.stop();
});

test("partial courses and failed pages retry automatically without starving other courses", async () => {
  let courseCalls = 0, pageCalls = 0;
  const run = harness({ readResources: async id => resources(id, id === 1 && ++courseCalls === 1), readPage: async () => { if (++pageCalls === 1) throw Error("Network failure"); return { title: "Page", body: "" }; } });
  await run.tick(); assert.equal(run.reports.get(1).status, "partial");
  await run.tick(); assert.equal(run.reports.get(2).status, "current");
  await run.tick(); await run.tick();
  assert.equal(run.reports.get(1).failedPages, 1);
  run.advance(30_000); await run.tick(); await run.tick();
  assert.equal(run.reports.get(1).status, "current"); assert.equal(run.reports.get(1).failedPages, 0);
  assert.equal(run.reports.get(1).checkedPages, 1);
  run.stop();
});

test("checks pause offline and in hidden tabs, avoid overlapping reads, and discard responses after sign-out", async () => {
  let calls = 0, finish;
  const saved = [];
  const run = harness({ readResources: id => { calls++; return new Promise(resolve => { finish = () => resolve(resources(id)); }); }, onResources: id => saved.push(id) });
  run.target.navigator.onLine = false; await run.tick();
  run.target.navigator.onLine = true; run.doc.visibilityState = "hidden"; await run.tick(); assert.equal(calls, 0);
  run.doc.visibilityState = "visible";
  const pending = run.tick(); await run.tick(); assert.equal(calls, 1);
  run.stop(); finish(); await pending;
  assert.deepEqual(saved, []); await run.tick(); assert.equal(calls, 1);
});

test("permission failures stay distinct and removed pages are no longer checked", async () => {
  let pages = true, pageCalls = 0;
  const run = harness({ courses: [{ id: 1 }], readResources: async id => ({ ...resources(id), ...(!pages ? { pages: [], modules: [] } : {}) }), readPage: async () => { pageCalls++; throw Error("Canvas request failed (403)."); } });
  await run.tick(); await run.tick(); assert.equal(run.reports.get(1).restrictedPages, 1);
  run.advance(30_000); await run.tick(); assert.equal(pageCalls, 1);
  pages = false; run.advance(15 * 60_000); await run.tick(); await run.tick();
  assert.equal(run.reports.get(1).pages, 0); assert.equal(pageCalls, 1);
  run.stop();
});

test("partial data is never cached as complete and forced reads still share an in-flight request", async () => {
  const cache = createRequestCache(); let calls = 0;
  const fetcher = async () => ({ _sync: { partial: ++calls === 1 } });
  await cache.read("user-a", "course", fetcher); await cache.read("user-a", "course", fetcher);
  assert.equal(calls, 2); await cache.read("user-a", "course", fetcher); assert.equal(calls, 2);
  await Promise.all([cache.read("user-a", "course", fetcher, { refresh: true }), cache.read("user-a", "course", fetcher, { refresh: true })]);
  assert.equal(calls, 3); await cache.read("user-b", "course", fetcher); assert.equal(calls, 4);
});

test("source comparisons flag lost MIME types, quiz dates, lock states, and course home content without blocking delivery", () => {
  const file = { id: 1, name: "schedule.xlsx", "content-type": "image/png", size: 50, locked_for_user: true };
  const mapped = { id: 1, name: file.name, contentType: "image/png", size: 50, folderId: null, locked: true };
  assert.equal(compareCanvasCollections({ files: [file] }, { files: [mapped] }).files.matched, true);
  for (const change of [{ contentType: null }, { locked: false }]) assert.equal(compareCanvasCollections({ files: [file] }, { files: [{ ...mapped, ...change }] }).files.matched, false);
  const quiz = { id: 1, title: "Quiz", due_at: "2026-09-12", locked_for_user: true };
  assert.equal(compareCanvasCollections({ quizzes: [quiz] }, { quizzes: [{ id: 1, title: "Quiz" }] }).quizzes.matched, false);
  const course = { default_view: "modules", syllabus_body: "<table>Course summary</table>" };
  const view = { defaultView: "modules", syllabusBody: course.syllabus_body, homeBody: "", homeTitle: null, hasFrontPage: false };
  assert.equal(compareCanvasCourse(course, null, view).matched, true);
  for (const change of [{ defaultView: "wiki" }, { syllabusBody: "" }]) assert.equal(compareCanvasCourse(course, null, { ...view, ...change }).matched, false);
});
