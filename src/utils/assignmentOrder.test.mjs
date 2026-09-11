import test from "node:test";
import assert from "node:assert/strict";
import { sortCourseAssignments, assignmentCategory } from "./assignmentOrder.js";

test("undated positions interleave groups like Canvas, regardless of titles or submission status", () => {
  const source = [
    { title: "Fabrication of Race", position: 5, groupPosition: 1 },
    { title: "Roll Call Attendance", position: 1, groupPosition: 1, submitted: true },
    { title: "Lecture Notes #1", position: 8, groupPosition: 1 },
    { title: "Letter from the Birmingham Jail", position: 2, groupPosition: 1, submitted: true },
    { title: "Another group", position: 1, groupPosition: 2 },
  ];
  assert.deepEqual(sortCourseAssignments(source).map(item => item.title), ["Roll Call Attendance", "Another group", "Letter from the Birmingham Jail", "Fabrication of Race", "Lecture Notes #1"]);
  assert.equal(source[0].title, "Fabrication of Race");
});

test("the reported interleaved-category regression matches Canvas's position-first order", () => {
  const titles = ["Roll Call Attendance", "Letter from the Birmingham Jail", "Integrating Race and Gender", "Reimagine Everything", "Fabrication of Race", "Why intersectionality", "Reading Experiment #1", "Lecture Notes #1"];
  const items = titles.map((title, index) => ({ title, position: index + 1, groupPosition: index === 1 || index === 3 ? 2 : 1 }));
  const grouped = [...items].sort((a, b) => a.groupPosition - b.groupPosition);
  assert.deepEqual(sortCourseAssignments(grouped).map(item => item.title), titles);
});

test("overdue category excludes submitted, locked, quiz, attendance and external-tool assignments", () => {
  const now = Date.parse("2026-09-09");
  const item = { dueAt: "2026-09-01", submissionTypes: ["online_upload"] };
  assert.equal(assignmentCategory(item, now), "Overdue Assignments");
  for (const patch of [{ submitted: true }, { locked: true }, { graded: true }, { submissionTypes: ["external_tool"] }, { submissionTypes: ["attendance"] }, { submissionTypes: ["online_quiz"] }]) {
    assert.equal(assignmentCategory({ ...item, ...patch }, now), "Past Assignments");
  }
});
test("date buckets keep upcoming ascending, past descending and equal dates in Canvas order", () => {
  const source = [
    { id: 1, dueAt: "2026-09-01", position: 1 },
    { id: 2, dueAt: "2026-09-15", position: 2 },
    { id: 3, dueAt: "2026-09-15", position: 1 },
    { id: 4, dueAt: null },
    { id: 5, dueAt: "2026-09-08" },
  ];
  assert.deepEqual(sortCourseAssignments(source, Date.parse("2026-09-09")).map(item => item.id), [3, 2, 4, 5, 1]);
});
