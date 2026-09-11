import test from "node:test";
import assert from "node:assert/strict";
import { boxPolicyEmbed, policyDocumentTarget, extractToolContent, readToolContent } from "../../supabase/functions/canvas/toolContent.ts";

test("preserves blank official grades without substituting calculated values", () => {
  const result = extractToolContent('<table><tr><th>Period</th><th>Course</th><th>Section</th><th>Grade</th></tr><tr><td>Mid-semester</td><td>PHYS 009 10</td><td>30615</td><td></td></tr></table>', 'https://grades.example.edu/', 'Mid/Final Grades');
  assert.equal(result.kind, 'grades');
  assert.deepEqual(result.rows[1], ['Mid-semester', 'PHYS 009 10', '30615', '']);
});
test("Macmillan menu uses only returned links", () => {
  const result = extractToolContent('<a href="/achieve">Achieve</a><a href="javascript:alert(1)">Macmillan User Profile</a>', 'https://learning.example.edu/', 'Macmillan Learning');
  assert.equal(result.links.length, 4);
  assert.equal(result.links[0].url, 'https://learning.example.edu/achieve');
  assert.equal(result.links[3].url, null);
});

test("retains the provider's menu icon beside its corresponding link", () => {
  const result = extractToolContent('<img src="/images/achieve.png"><a href="/achieve">Achieve</a><p>Access the homepage</p><img src="/images/diagnostics.png"><a href="/diagnostics">Macmillan Learning Diagnostics</a>', 'https://learning.example.edu/', 'Macmillan Learning');
  assert.equal(result.links[0].iconUrl, 'https://learning.example.edu/images/achieve.png');
  assert.equal(result.links[1].iconUrl, 'https://learning.example.edu/images/diagnostics.png');
  assert.equal(result.links[2].iconUrl, null);
});

test("university policy redirects load a PDF without leaking source cookies", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), ...options });
    if (calls.length === 1) return new Response(null, { status: 302, headers: { Location: 'https://studentaffairs.ucmerced.edu/policy.pdf', 'Set-Cookie': 'session=private; Secure' } });
    return new Response('%PDF-1.7 fixture');
  };
  try {
    const result = await readToolContent('https://catcourses.ucmerced.edu/launch', 'https://catcourses.ucmerced.edu', 'Resources & Policy', async () => ['93.184.216.34']);
    assert.equal(result.kind, 'pdf');
    assert.equal(calls[1].headers.Cookie, undefined);
    assert.equal(calls[1].headers.Authorization, undefined);
    assert.equal(calls[1].method, 'GET');
    assert.equal(calls[1].body, undefined);
  } finally { globalThis.fetch = original; }
});

test("policy redirects to hosts resolving to private addresses stay blocked", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { Location: 'https://ucmerced.edu.untrusted.example/policy.pdf' } });
  try {
    await assert.rejects(readToolContent('https://catcourses.ucmerced.edu/launch', 'https://catcourses.ucmerced.edu', 'Resources & Policy', async () => ['10.0.0.1']), /public server/);
  } finally { globalThis.fetch = original; }
});

test("policy can follow multiple public document hosts and retrieve its PDF", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), ...options });
    if (calls.length === 1) return new Response(null, { status: 302, headers: { Location: 'https://documents.example.org/policy', 'Set-Cookie': 'session=private; Secure' } });
    if (calls.length === 2) return new Response(null, { status: 302, headers: { Location: 'https://cdn.example.org/policy.pdf' } });
    return new Response('%PDF-1.7 fixture');
  };
  try {
    const result = await readToolContent('https://catcourses.ucmerced.edu/launch', 'https://catcourses.ucmerced.edu', 'Resources & Policy', async () => ['93.184.216.34']);
    assert.equal(result.kind, 'pdf');
    assert.equal(calls.length, 3);
    for (const call of calls.slice(1)) {
      assert.equal(call.headers.Cookie, undefined);
      assert.equal(call.headers.Authorization, undefined);
      assert.equal(call.body, undefined);
    }
  } finally { globalThis.fetch = original; }
});
test("missing official grade data is an error rather than fabricated rows", () => {
  assert.throws(() => extractToolContent('<p>Sign in</p>', 'https://grades.example.edu/', 'Mid/Final Grades'), /did not return/);
});
test("signed LTI form is posted to its provider without Canvas credentials", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), ...options });
    if (calls.length === 1) return new Response('<form action="https://provider.example.edu/launch"><input type="hidden" name="oauth_signature" value="signed"><input type="hidden" name="resource_link_id" value="9"></form>');
    return new Response('<main><h1>Resources &amp; Policy</h1><p>Published policy content</p></main>');
  };
  try {
    const result = await readToolContent('https://canvas.example.edu/launch', 'https://canvas.example.edu', 'Resources & Policy');
    assert.equal(calls[1].method, 'POST');
    assert.equal(calls[1].headers.Authorization, undefined);
    assert.equal(calls[1].body.get('oauth_signature'), 'signed');
    assert.deepEqual(result.paragraphs, ['Resources & Policy', 'Published policy content']);
  } finally { globalThis.fetch = original; }
});

test("Box policy shares use the supported embed and keep the exact document", () => {
  assert.equal(boxPolicyEmbed("https://ucmerced.box.com/s/document-share"), "https://ucmerced.box.com/embed/s/document-share?uxLite=true");
  assert.equal(boxPolicyEmbed("https://ucmerced.box.com/embed/s/document-share/file/42"), "https://ucmerced.box.com/embed/s/document-share/file/42?uxLite=true");
  assert.equal(boxPolicyEmbed("https://box.com.untrusted.example/s/document-share"), null);
  assert.equal(boxPolicyEmbed("https://ucmerced.box.com/login"), null);
  assert.equal(policyDocumentTarget('<iframe src="https://ucmerced.box.com/embed/s/document-share"></iframe>', "https://policy.ucmerced.edu"), "https://ucmerced.box.com/embed/s/document-share");
  assert.equal(policyDocumentTarget('<iframe src="/first.pdf"></iframe><iframe src="/second.pdf"></iframe>', "https://policy.ucmerced.edu"), null);
});

test("Canvas's policy redirect embeds Box without scraping login controls or forwarding cookies", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 302, headers: { Location: "https://ucmerced.box.com/s/exact-policy-document", "Set-Cookie": "canvas=session" } });
  };
  try {
    const result = await readToolContent("https://catcourses.ucmerced.edu/launch", "https://catcourses.ucmerced.edu", "Resources & Policy", async () => ["93.184.216.34"]);
    assert.deepEqual(result, { kind: "policy-embed", url: "https://ucmerced.box.com/embed/s/exact-policy-document?uxLite=true" });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test("a policy HTML wrapper opens its single PDF or Box document rather than becoming empty text", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<iframe src="https://ucmerced.box.com/embed/s/policy"></iframe>');
  try {
    const result = await readToolContent("https://policy.ucmerced.edu/launch", "https://catcourses.ucmerced.edu", "Resources & Policy", async () => ["93.184.216.34"]);
    assert.equal(result.url, "https://ucmerced.box.com/embed/s/policy?uxLite=true");
    await assert.rejects(readToolContent("https://policy.ucmerced.edu/launch", "https://catcourses.ucmerced.edu", "Resources & Policy", async () => ["192.168.1.2"]), /public server/);
  } finally { globalThis.fetch = original; }
});
