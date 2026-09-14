import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const source = readFileSync(new URL("../../supabase/functions/canvas/index.ts", import.meta.url), "utf8");
const start = source.indexOf("async function assignmentDetails(");
const end = source.indexOf("async function uploadSubmissionFile(", start);
const createDetails = new Function("canvasRequest", "optionalCanvasRequest", "mapAssignment", "safeLink",
  stripTypeScriptTypes(source.slice(start, end)) + "\nreturn assignmentDetails;");

function fixture({ external = true, launch = { url: "https://canvas.example/launch/signed-assessment" } } = {}) {
  const paths = [];
  const details = createDetails(async () => ({ data: {} }), async (_host, path) => {
    paths.push(path);
    return path.includes("sessionless_launch") ? launch : null;
  }, () => ({ submissionTypes: external ? ["external_tool"] : ["online_upload"],
    externalToolUrl: "https://tool.example/home", htmlUrl: "https://canvas.example/courses/4/assignments/99" }),
  value => value || null);
  return { details, paths };
}

test("external assignment launch asks Canvas for the specific assessment context", async () => {
  const { details, paths } = fixture();
  const result = await details("https://canvas.example", "test-token", 4, 99);
  const request = new URL(paths.find(path => path.includes("sessionless_launch")), "https://canvas.example");
  assert.equal(request.searchParams.get("launch_type"), "assessment");
  assert.equal(request.searchParams.get("assignment_id"), "99");
  assert.equal(request.searchParams.has("url"), false);
  assert.equal(result.externalLaunchUrl, "https://canvas.example/launch/signed-assessment");
});

test("unavailable launch never falls back to the tool homepage", async () => {
  for (const launch of [null, {}]) {
    const { details } = fixture({ launch });
    const result = await details("https://canvas.example", "test-token", 4, 99);
    assert.equal(result.externalLaunchUrl, null);
    assert.equal(result.htmlUrl, "https://canvas.example/courses/4/assignments/99");
  }
});

test("file upload assignments do not request external launches", async () => {
  const { details, paths } = fixture({ external: false });
  await details("https://canvas.example", "test-token", 4, 99);
  assert.equal(paths.some(path => path.includes("sessionless_launch")), false);
});
