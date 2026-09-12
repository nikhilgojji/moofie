import { lazy, Suspense, useEffect, useState } from "react";
import { loadCourseFile, loadCourseFilePreview } from "../canvasApi";
import { filePreviewKind } from "../utils/filePreview";
import { ContentSkeleton } from "./ContentSkeleton";
import { startCanvasAutoRefresh } from "../utils/canvasSync";
const SpreadsheetPreview = lazy(() => import("./SpreadsheetPreview"));

export function useFilePreview(courseId, file, enabled = true) {
  const [state, setState] = useState({});
  const [revision, setRevision] = useState(0);
  const kind = filePreviewKind(file);
  const key = enabled && courseId && file?.id && !file.needsDetails ? `${courseId}:${file.id}:${file.contentType}:${file.name}:${file.locked}:${revision}` : "";
  useEffect(() => {
    if (!key) { setState({}); return; }
    let active = true;
    let objectUrl;
    setState({ key, loading: true });
    async function load() {
      if (file.locked) throw new Error("This file is currently locked in Canvas.");
      if (kind === "document") {
        const spreadsheet = /\.(xlsx?|xlsm|ods)$/i.test(file.name || "");
        let result;
        try { result = await loadCourseFilePreview(courseId, file.id); }
        catch (error) { if (!spreadsheet) throw error; }
        if (!result?.previewUrl && spreadsheet) return { spreadsheet: true };
        return { documentUrl: result.previewUrl };
      }
      const mime = file.contentType && file.contentType !== "application/octet-stream" ? file.contentType :
        kind === "html" ? "text/html" : kind === "text" ? "text/plain" :
        String(file.name).toLowerCase().endsWith(".svg") ? "image/svg+xml" : undefined;
      const blob = await loadCourseFile(courseId, file.id, mime);
      if (!active) return {};
      objectUrl = URL.createObjectURL(blob);
      return { blob, url: objectUrl, text: kind === "text" ? await blob.text() : undefined };
    }
    load().then(result => {
      if (active) setState({ ...result, key, loading: false });
    }).catch(error => {
      if (active) setState({ key, loading: false, error: error.message || "The file could not be loaded." });
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [key, courseId, file?.id, file?.contentType, file?.locked, kind]);
  // Do not show the previous file during navigation or an unfinished metadata request.
  const current = state.key === key ? state : { loading: Boolean(enabled) };
  useEffect(() => {
    if (!enabled) return;
    const retry = () => setRevision(value => value + 1);
    window.addEventListener("moofie:refresh", retry);
    const stop = current.error ? startCanvasAutoRefresh(retry) : () => {};
    return () => { stop(); window.removeEventListener("moofie:refresh", retry); };
  }, [enabled, current.error]);
  return { ...current, kind, retry: () => setRevision(value => value + 1) };
}

export function FileDownload({ courseId, file, preview, children, ...props }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const blob = preview.blob || await loadCourseFile(courseId, file.id, file.contentType);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (failure) {
      setError(failure.message || "The download failed. Please retry.");
    } finally { setBusy(false); }
  }
  return <><button type="button" {...props} disabled={busy || file.locked} onClick={download} aria-busy={busy}>{children}</button>{error && <span role="alert">{error}</span>}</>;
}

export function FilePreview({ preview, file, PdfPreview, courseId }) {
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameError, setFrameError] = useState(false);
  useEffect(() => { setFrameLoaded(false); setFrameError(false); }, [preview.documentUrl]);
  if (preview.loading) return <ContentSkeleton label="Opening document" variant="document" />;
  if (preview.spreadsheet || frameError && /\.(xlsx?|xlsm|ods)$/i.test(file.name || "")) return <Suspense fallback={<ContentSkeleton label="Opening spreadsheet" variant="document" />}><SpreadsheetPreview key={file.id} courseId={courseId} file={file} /></Suspense>;
  if (preview.error || frameError) return <div className="document-reader-message" role="alert"><p>{preview.error || "The document preview could not load."}</p><button type="button" onClick={() => { setFrameError(false); preview.retry(); }}>Retry preview</button></div>;
  if (preview.kind === "pdf") return <PdfPreview fileUrl={preview.url} fileBlob={preview.blob} name={file.name} />;
  if (preview.kind === "image") return <div className="document-reader-image"><img src={preview.url} alt={file.name} /></div>;
  if (preview.kind === "text") return <pre className="document-reader-text">{preview.text}</pre>;
  if (preview.kind === "html") return <iframe className="document-reader-frame" src={preview.url} title={file.name} sandbox="" referrerPolicy="no-referrer" />;
  if (preview.kind === "video" || preview.kind === "audio") {
    const Media = preview.kind;
    return <div className="document-reader-media"><Media controls src={preview.url} preload="metadata" aria-label={file.name} /></div>;
  }
  if (preview.documentUrl) return <div className="document-reader-office">
    <div className="document-preview-toolbar"><button type="button" onClick={preview.retry}>Reload preview</button></div>
    {!frameLoaded && <ContentSkeleton label="Loading document preview" variant="document" />}
    <iframe className="document-reader-frame" src={preview.documentUrl} title={file.name}
      referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-downloads" allow="fullscreen"
      onLoad={() => setFrameLoaded(true)} onError={() => setFrameError(true)} />
  </div>;
  return <div className="document-reader-message"><p>Moofie could not obtain a preview for this file yet. You can retry or download the original file.</p><button type="button" onClick={preview.retry}>Retry preview</button></div>;
}
