import { useEffect, useState } from "react";

export function useDocumentFullscreen(ref) {
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [ref]);
  async function toggle() {
    setError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (ref.current?.requestFullscreen) await ref.current.requestFullscreen();
      else setError("Fullscreen is unavailable in this browser.");
    } catch { setError("Fullscreen could not open. You can continue reading here."); }
  }
  return { fullscreen, toggle, error };
}

export function DocumentToolbar({ pageNumber = 1, pageCount = 1, onPageChange, scale = 1, autoFit, onZoom, onFit, onRotate, fullscreen, onFullscreen, disabled = false, downloadUrl, name }) {
  return <div className="moofie-pdf-toolbar">
    <div className="moofie-pdf-page-controls">
      <span>Page</span>
      <button type="button" aria-label="Previous page" disabled={disabled || pageNumber <= 1} onClick={() => onPageChange(pageNumber - 1)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg></button>
      <input aria-label="Page number" type="number" min="1" max={pageCount || 1} value={pageNumber} disabled={disabled || !pageCount} onChange={event => onPageChange(Math.min(pageCount || 1, Math.max(1, Math.trunc(Number(event.target.value)) || 1)))} />
      <button type="button" aria-label="Next page" disabled={disabled || !pageCount || pageNumber >= pageCount} onClick={() => onPageChange(pageNumber + 1)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg></button>
      <span>of {pageCount || "—"}</span>
    </div>
    <div className="moofie-pdf-view-controls">
      <button type="button" aria-label="Zoom out" disabled={disabled || scale <= 0.25} onClick={() => onZoom(-0.15)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 12h12" /></svg></button>
      <button className="moofie-pdf-zoom" type="button" title="Fit page width" disabled={disabled} onClick={onFit}>{autoFit ? "Zoom" : `${Math.round(scale * 100)}%`}</button>
      <button type="button" aria-label="Zoom in" disabled={disabled || scale >= 3} onClick={() => onZoom(0.15)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 6v12M6 12h12" /></svg></button>
      <button type="button" aria-label="Rotate clockwise" disabled={disabled} onClick={onRotate}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></svg></button>
    </div>
    <div className="moofie-pdf-document-controls">
      <button type="button" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={onFullscreen}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></svg></button>
      {downloadUrl && <a href={downloadUrl} download={name} aria-label={`Download ${name}`}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg></a>}
    </div>
  </div>;
}
