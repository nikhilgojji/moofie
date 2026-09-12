import test from "node:test";
import assert from "node:assert/strict";
import { loadFilePreview } from "../../supabase/functions/canvas/filePreview.ts";
import { detectBinaryPreview, filePreviewKind } from "./filePreview.js";

const origin = "https://catcourses.ucmerced.edu";
const signed = "/api/v1/canvadoc_session?blob=signed-file&hmac=signature";
const session = "https://canvadocs.instructure.com/1/sessions/signed-session/view";

test("Canvas content type takes precedence over a misleading attachment filename", () => {
  for (const [contentType, expected] of [["image/png", "image"], ["image/jpeg", "image"], ["application/pdf", "pdf"], ["text/html", "html"]]) {
    assert.equal(filePreviewKind({ name: "Tentative 141 Schedule F2026.xlsx", contentType }), expected);
  }
  assert.equal(filePreviewKind({ name: "picture.png", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "document");
});

test("binary detection recovers converted images and PDFs without interpreting HTML as a document", async () => {
  for (const [bytes, mime] of [[Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), "image/png"], [Uint8Array.of(255, 216, 255), "image/jpeg"], ["GIF89a", "image/gif"], ["RIFF0000WEBP", "image/webp"], ["%PDF-1.7", "application/pdf"]]) {
    assert.equal((await detectBinaryPreview(new Blob([bytes]))).mime, mime);
  }
  for (const value of ["", "<html>Sign in</html>", "PK workbook", "RIFF0000WAVE"]) assert.equal(await detectBinaryPreview(new Blob([value])), null);
});

test("Office formats request Canvas previews even with generic or misleading MIME types", () => {
  for (const name of ["Schedule.XLSX", "notes.xls", "slides.pptx", "essay.docx", "doc.rtf", "sheet.ods"]) {
    assert.equal(filePreviewKind({ name, contentType: "application/octet-stream" }), "document");
  }
  assert.equal(filePreviewKind({ name: "essay.rtf", contentType: "text/rtf" }), "document");
  for (const [name, kind] of [["document.PDF", "pdf"], ["picture.svg", "image"], ["lecture.mp4", "video"], ["audio.mp3", "audio"], ["data.csv", "text"], ["page.html", "html"]]) {
    assert.equal(filePreviewKind({ name }), kind);
  }
});

test("authenticated preview resolves the signed Canvas redirect without forwarding the token to DocViewer", async () => {
  const result = await loadFilePreview(origin, "test-token", 12, async path => {
    assert.equal(path, "/api/v1/files/12?include[]=preview_url");
    return { canvadoc_session_url: signed };
  }, async (url, options) => {
    assert.equal(url.origin, origin);
    assert.equal(options.headers.Authorization, "Bearer test-token");
    assert.equal(options.redirect, "manual");
    return new Response(null, { status: 302, headers: { Location: session } });
  });
  assert.deepEqual(result, { previewUrl: session });
  assert.ok(!JSON.stringify(result).includes("test-token"));
});

test("preview_url signed sessions also work; enhanced Canvas pages are never embedded", async () => {
  assert.deepEqual(await loadFilePreview(origin, "token", 12, async () => ({ preview_url: signed }), async () => new Response(null, { status: 302, headers: { Location: session } })), { previewUrl: session });
  for (const preview_url of [null, "/courses/39/files/12/file_preview", "https://evil.example/api/v1/canvadoc_session?blob=x&hmac=y"]) {
    assert.deepEqual(await loadFilePreview(origin, "token", 12, async () => ({ preview_url }), () => assert.fail("Must not request a Canvas page or another host")), { previewUrl: null });
  }
});

test("locked and hidden files cannot launch a preview", async () => {
  for (const flag of ["locked_for_user", "hidden_for_user"]) {
    await assert.rejects(loadFilePreview(origin, "token", 12, async () => ({ [flag]: true, canvadoc_session_url: signed }), () => assert.fail("Must not launch a locked file")), /locked/);
  }
});

test("missing API preview metadata recovers through the authenticated Canvas file view", async () => {
  const paths = [];
  const result = await loadFilePreview(origin, "token", 12, async path => {
    paths.push(path);
    return path.includes(".json") ? { attachment: { canvadoc_session_url: signed } } : { id: 12 };
  }, async () => new Response(null, { status: 302, headers: { Location: session } }));
  assert.deepEqual(paths, ["/api/v1/files/12?include[]=preview_url", "/files/12.json"]);
  assert.equal(result.previewUrl, session);
});

test("expired sessions, login redirects, and unsafe preview destinations fail without exposing a link", async () => {
  await assert.rejects(loadFilePreview(origin, "token", 12, async () => ({ canvadoc_session_url: signed }), async () => new Response("expired", { status: 403 })), /retry/);
  for (const destination of [origin + "/login", "https://evil.example/1/sessions/x/view", "https://canvadocs.instructure.com.evil.example/1/sessions/x/view", "http://canvadocs.instructure.com/1/sessions/x/view", session + "?access_token=secret"]) {
    await assert.rejects(loadFilePreview(origin, "token", 12, async () => ({ canvadoc_session_url: signed }), async () => new Response(null, { status: 302, headers: { Location: destination } })), /invalid document preview/);
  }
});
