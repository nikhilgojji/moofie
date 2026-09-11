import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { quizMetadata, sortQuizzes } from "./quizDisplay.js";

const now = Date.parse("2026-09-10T12:00:00Z");
test("quiz lists order dated work first, with undated titles after it", () => {
  const quizzes = [{ title: "Z undated" }, { title: "B same day", dueAt: "2026-09-10" }, { title: "Earlier", dueAt: "2026-09-09" }, { title: "A same day", dueAt: "2026-09-10" }, { title: "A undated" }];
  assert.deepEqual(sortQuizzes(quizzes).map(quiz => quiz.title), ["Earlier", "A same day", "B same day", "A undated", "Z undated"]);
  assert.equal(quizzes[0].title, "Z undated");
});
test("a closed quiz retains its due date, points and question count", () => {
  const labels = quizMetadata({ locked: true, lockAt: "2026-08-28T06:59:00Z", dueAt: "2026-08-28T06:59:00Z", points: 1, questionCount: 1 }, now);
  assert.equal(labels[0], "Closed");
  assert.match(labels[1], /^Due /);
  assert.deepEqual(labels.slice(2), ["1 pt", "1 Question"]);
});
test("future unlocks are not reported as closed and overdue alone does not close a quiz", () => {
  assert.match(quizMetadata({ locked: true, unlockAt: "2026-10-01T12:00:00Z" }, now)[0], /^Not available until /);
  assert.ok(!quizMetadata({ dueAt: "2026-08-28T06:59:00Z" }, now).includes("Closed"));
  assert.deepEqual(quizMetadata({ points: 0, questionCount: 0 }, now), ["0 pts", "0 Questions"]);
  assert.deepEqual(quizMetadata({}, now), []);
});
test("Canvas quiz mapping retains actual availability and question count", () => {
  const source = readFileSync(new URL("../../supabase/functions/canvas/index.ts", import.meta.url), "utf8");
  const mapping = source.slice(source.indexOf("    quizzes: quizzes.map") + "    quizzes: ".length, source.indexOf("    people: ")).trim().replace(/,$/, "").replace(/: any/g, "");
  const mapQuizzes = new Function("quizzes", "safeLink", `return ${mapping}`);
  const [quiz] = mapQuizzes([{ id: 12, title: "Lecture notes", quiz_type: "assignment", question_count: 1, points_possible: 1, due_at: "2026-08-28T06:59:00Z", lock_at: "2026-08-28T06:59:00Z", locked_for_user: true }], value => value);
  assert.equal(quiz.quizType, "assignment");
  assert.equal(quiz.questionCount, 1);
  assert.equal(quiz.lockAt, "2026-08-28T06:59:00Z");
  assert.equal(quizMetadata(quiz, now)[0], "Closed");
});
