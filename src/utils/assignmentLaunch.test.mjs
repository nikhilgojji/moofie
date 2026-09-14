import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { extractAssignmentLaunch, resolveAssignmentLaunch } from "../../supabase/functions/canvas/assignmentLaunch.ts";

const canvasOrigin = "https://canvas.example";
const canvasForm = `<form id="tool_form_abc" action="https://provider.example/oidc?one=1&amp;two=2" method="POST" data-tool-launch-type="window">
<input type="hidden" name="iss" value="https://canvas.example">
<input type="hidden" name="login_hint" value="signed-user-hint">
<input type="hidden" name="lti_message_hint" value="quiz-99&amp;signed=&quot;yes&quot;">
<button>Load Quiz 1 in a new window</button></form>`;

test("Canvas new-window page becomes the exact OIDC form, preserving signed quiz hints", () => {
  const result = extractAssignmentLaunch(canvasForm, canvasOrigin);
  assert.equal(result.kind, "form");
  assert.equal(result.action, "https://provider.example/oidc?one=1&two=2");
  assert.deepEqual(result.fields.at(-1), { name: "lti_message_hint", value: 'quiz-99&signed="yes"' });
});

test("legacy LTI signatures and duplicate fields survive; non-launch forms are rejected", () => {
  const form = `<form id="tool_form" action="https://provider.example/lti" method="post">
  <input type="hidden" name="oauth_signature" value="a+b/c=">
  <input type="hidden" name="lti_message_type" value="basic-lti-launch-request">
  <input type="hidden" name="custom" value="a"><input type="hidden" name="custom" value="b"></form>`;
  assert.equal(extractAssignmentLaunch(form, canvasOrigin).fields.length, 4);
  for (const html of [canvasForm.replace('tool_form_abc', 'login'), canvasForm.replace('method="POST"', 'method="GET"'),
    `<script>${canvasForm}</script>`, '<form id="tool_form"><input type="password" name="password"></form>',
    canvasForm.replace('https://provider.example/oidc', 'javascript:alert')]) {
    assert.throws(() => extractAssignmentLaunch(html, canvasOrigin));
  }
});

test("session-token redirects retain Canvas cookies without submitting to the provider", async () => {
  const requests = [];
  const result = await resolveAssignmentLaunch(canvasOrigin + '/courses/4/assignments/99?session_token=single-use', canvasOrigin, async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1 ? new Response(null, { status: 302, headers: { location: '/courses/4/assignments/99?display=borderless', 'set-cookie': '_session=private; Path=/; Secure' } })
      : new Response(canvasForm, { headers: { 'content-type': 'text/html' } });
  });
  assert.equal(result.kind, 'form');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.headers.Cookie, '_session=private');
  assert.ok(requests.every(({ url, options }) => new URL(url).origin === canvasOrigin && !options.headers.Authorization));
});

test("provider redirects are handed to the browser, never fetched with Canvas cookies", async () => {
  let requests = 0;
  const result = await resolveAssignmentLaunch(canvasOrigin + '/launch', canvasOrigin, async () => {
    requests++;
    return new Response(null, { status: 302, headers: { location: 'https://provider.example/quiz/99', 'set-cookie': '_session=private' } });
  });
  assert.deepEqual(result, { kind: 'url', url: 'https://provider.example/quiz/99' });
  assert.equal(requests, 1);
});

test("expired launches, redirect loops and oversized launch pages fail with bounded work", async () => {
  await assert.rejects(resolveAssignmentLaunch(canvasOrigin + '/launch', canvasOrigin, async () => new Response('expired', { status: 403 })));
  let hops = 0;
  await assert.rejects(resolveAssignmentLaunch(canvasOrigin + '/launch', canvasOrigin, async () => { hops++; return new Response(null, { status: 302, headers: { location: '/loop' } }); }));
  assert.equal(hops, 6);
  await assert.rejects(resolveAssignmentLaunch(canvasOrigin + '/launch', canvasOrigin, async () => new Response('x'.repeat(2_000_001), { headers: { 'content-type': 'text/html' } })), /oversized/);
});

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
