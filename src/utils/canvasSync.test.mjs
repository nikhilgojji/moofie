import test from "node:test";
import assert from "node:assert/strict";
import { recoverCanvasRead, getCanvasSync, resetCanvasSync, mergeCourseResources, startCanvasAutoRefresh } from "./canvasSync.js";
import { compareCanvasCollections } from "../../supabase/functions/canvas/courseAudit.ts";

test("temporary read errors recover with bounded backoff, but submissions and permissions never retry", async () => {
  resetCanvasSync(); let calls = 0; const delays = [];
  const data = await recoverCanvasRead("course_resources", { courseId: 4 }, async () => { if (++calls < 3) throw Error("Canvas request failed (503)."); return { pages: [1] }; }, { sleep: ms => delays.push(ms), random: () => 0 });
  assert.equal(calls, 3); assert.deepEqual(delays, [700, 1400]); assert.deepEqual(data.pages, [1]);
  assert.equal(Object.values(getCanvasSync().records)[0].status, "current");
  for (const [action, message] of [["submit_assignment", "Network error"], ["course_resources", "Canvas request failed (403)."], ["course_file", "Canvas rejected this token."]]) {
    calls = 0;
    await assert.rejects(recoverCanvasRead(action, {}, () => { calls++; throw Error(message); }));
    assert.equal(calls, 1);
  }
});

test("sync success timestamps survive failures and account changes discard old responses", async () => {
  resetCanvasSync();
  await recoverCanvasRead("dashboard", {}, async () => ({ _sync: { checkedAt: "2026-09-11T12:00:00Z" } }));
  await assert.rejects(recoverCanvasRead("dashboard", {}, async () => { throw Error("Canvas rejected this token."); }));
  assert.equal(Object.values(getCanvasSync().records)[0].checkedAt, "2026-09-11T12:00:00Z");
  let finish;
  const pending = recoverCanvasRead("course_page", {}, () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve(); resetCanvasSync(); finish({ title: "Old account" });
  await assert.rejects(pending, /account changed/);
  assert.deepEqual(getCanvasSync().records, {});
});

test("a failed course section preserves saved data while successful empty responses and revoked permissions replace it", () => {
  const previous = { pages: [{ id: 1 }], files: [{ id: 2 }], modules: [{ id: 3 }] };
  const result = mergeCourseResources(previous, { pages: [], files: [], modules: [], _sync: { sections: { pages: "error", files: "current", modules: "restricted" } } });
  assert.deepEqual(result.pages, previous.pages); assert.deepEqual(result.files, []); assert.deepEqual(result.modules, []);
});

test("source comparisons detect missing, reordered, renamed or altered content in any course", () => {
  const source = { pages: [{ page_id: 1, title: "Syllabus" }, { page_id: 2, title: "Schedule" }] };
  const correct = { pages: [{ id: 1, title: "Syllabus" }, { id: 2, title: "Schedule" }] };
  assert.equal(compareCanvasCollections(source, correct).pages.matched, true);
  for (const pages of [correct.pages.slice(1), correct.pages.toReversed(), [{ id: 1, title: "Wrong" }, correct.pages[1]]]) assert.equal(compareCanvasCollections(source, { pages }).pages.matched, false);
  assert.equal(compareCanvasCollections({ announcements: [{ id: 1, message: "Changed instructions" }] }, { announcements: [{ id: 1, message: "Old instructions" }] }).announcements.matched, false);
});

test("automatic comparisons pause in background/offline and resume on reconnect", async () => {
  const target = new EventTarget(), doc = new EventTarget();
  let tick, time = 0, checks = 0;
  target.navigator = { onLine: true }; target.setInterval = cb => { tick = cb; return 1; }; target.clearInterval = () => {};
  doc.visibilityState = "visible";
  const stop = startCanvasAutoRefresh(async () => checks++, { target, doc, now: () => time, interval: 100 });
  time = 101; await tick(); assert.equal(checks, 1);
  doc.visibilityState = "hidden"; time = 202; await tick(); assert.equal(checks, 1);
  doc.visibilityState = "visible"; target.navigator.onLine = false; await tick(); assert.equal(checks, 1);
  target.navigator.onLine = true; target.dispatchEvent(new Event("online")); await Promise.resolve(); assert.equal(checks, 2);
  stop(); target.dispatchEvent(new Event("online")); await Promise.resolve(); assert.equal(checks, 2);
});
