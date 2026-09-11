import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("announcements never appear in Discussions and closed topics retain their group", () => {
  const source = readFileSync(new URL("../../supabase/functions/canvas/index.ts", import.meta.url), "utf8");
  const expression = source.slice(source.indexOf("    discussions: discussions") + "    discussions: ".length, source.indexOf("    quizzes: quizzes")).trim().replace(/,$/, "").replace(/: any/g, "");
  const map = new Function("discussions", "safeLink", `return ${expression}`);
  const result = map([
    { id: 1, title: "Welcome", is_announcement: true },
    { id: 2, title: "Open discussion", locked: false, locked_for_user: true },
    { id: 3, title: "Closed discussion", locked: true },
  ], value => value || null);
  assert.deepEqual(result.map(item => item.id), [2, 3]);
  assert.equal(result[0].closed, false);
  assert.equal(result[1].closed, true);
});
