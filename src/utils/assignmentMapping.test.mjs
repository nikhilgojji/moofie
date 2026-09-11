import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const source = readFileSync(new URL("../../supabase/functions/canvas/index.ts", import.meta.url), "utf8");
const start = source.indexOf("function mapAssignment(");
const end = source.indexOf("async function dashboard", start);
const mapAssignment = new Function("safeLink", stripTypeScriptTypes(source.slice(start, end)) + "\nreturn mapAssignment;")(value => value || null);

test("Canvas position and submission comments survive the actual backend mapping", () => {
  const mapped = mapAssignment({ id: 1, name: "Letter", position: 2, submission: { attempt: 1, submitted_at: "2026-09-01T18:38:00Z", submission_comments: [{ id: 8, author_name: "Instructor", comment: "Received", created_at: "2026-09-02T12:00:00Z" }], submission_history: [{ attempt: 1, submitted_at: "2026-09-01T18:38:00Z" }] } }, 9, 10, 20, 3);
  assert.equal(mapped.position, 2);
  assert.equal(mapped.groupPosition, 3);
  assert.equal(mapped.submission.comments[0].text, "Received");
  assert.equal(mapped.submission.history[0].attempt, 1);
});
test("empty comments and unavailable comments are distinct", () => {
  assert.deepEqual(mapAssignment({ submission: { submission_comments: [] } }, 1, 1, 0).submission.comments, []);
  assert.equal(mapAssignment({ submission: {} }, 1, 1, 0).submission.comments, null);
});
