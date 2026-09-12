import { useEffect, useRef, useState } from "react";
import { loadCourseFile } from "../canvasApi";
import { ContentSkeleton } from "./ContentSkeleton";

export default function SpreadsheetPreview({ courseId, file, sourceBlob }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [sheetIndex, setSheetIndex] = useState(0);
  const workerRef = useRef(null);
  const requestRef = useRef(0);
  const scrollRef = useRef(null);
  const paperRef = useRef(null);
  const [zoom, setZoom] = useState("fit");
  const [viewportWidth, setViewportWidth] = useState(1000);
  const [paperHeight, setPaperHeight] = useState(0);
  useEffect(() => {
    if (!result || !scrollRef.current || !paperRef.current) return;
    const measure = () => { setViewportWidth(scrollRef.current?.clientWidth || 1000); setPaperHeight(paperRef.current?.offsetHeight || 0); };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(scrollRef.current); observer.observe(paperRef.current);
    return () => observer.disconnect();
  }, [result]);
  useEffect(() => {
    let active = true;
    let worker;
    try { worker = new Worker(new URL("../utils/spreadsheet.worker.js", import.meta.url), { type: "module" }); }
    catch { setError("The spreadsheet reader could not start in this browser. Retry or download the original file."); setLoading(false); return; }
    workerRef.current = worker;
    setResult(null); setError(""); setLoading(true); setSheetIndex(0);
    const timer = setTimeout(() => { worker.terminate(); if (active) { setError("This workbook took too long to open. Retry or download the original file."); setLoading(false); } }, 60_000);
    worker.onmessage = ({ data }) => {
      if (!active || data.requestId !== requestRef.current) return;
      clearTimeout(timer); setLoading(false);
      if (data.error) setError(data.error); else { setResult(data); setError(""); }
    };
    worker.onerror = () => { clearTimeout(timer); if (active) { setError("The spreadsheet reader could not start. Please retry."); setLoading(false); } };
    (sourceBlob ? Promise.resolve(sourceBlob) : loadCourseFile(courseId, file.id, file.contentType)).then(async blob => {
      if (blob.size > 25 * 1024 * 1024) throw new Error("This workbook exceeds the 25 MB preview limit. Download the original file to view it.");
      const bytes = await blob.arrayBuffer();
      if (active) worker.postMessage({ bytes, fileName: file.name, requestId: ++requestRef.current }, [bytes]);
    }).catch(failure => { clearTimeout(timer); if (active) { setError(failure.message); setLoading(false); } });
    return () => { active = false; clearTimeout(timer); worker.terminate(); };
  }, [courseId, file.id, file.contentType, sourceBlob, revision]);
  function navigate(sheet, rowStart = 0, colStart = 0) {
    setSheetIndex(sheet); setLoading(true);
    workerRef.current.postMessage({ sheetIndex: sheet, rowStart, colStart, requestId: ++requestRef.current });
  }
  if (error) return <div className="document-reader-message" role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(v => v + 1)}>Retry preview</button></div>;
  if (!result) return <ContentSkeleton label="Opening spreadsheet from Canvas" variant="document" />;
  const { page, names } = result;
  const paperWidth = page.columnWidths.reduce((sum, width) => sum + width, 0) + 96;
  const scale = zoom === "fit" ? Math.min(1, Math.max(0.1, (viewportWidth - 48) / paperWidth)) : zoom;
  function printBand(parts, className) {
    if (!parts || !Object.values(parts).some(runs => runs.length)) return null;
    return <div className={className}>{["left", "center", "right"].map(side => <div key={side} style={{ textAlign: side }}>{parts[side].map((run, i) => <span key={i} style={run.style}>{run.text}</span>)}</div>)}</div>;
  }
  return <section className="spreadsheet-preview" aria-label={file.name} aria-busy={loading}>
    <div className="spreadsheet-controls">
      <label>Worksheet <select value={sheetIndex} onChange={e => navigate(Number(e.target.value))}>{names.map((name, i) => <option value={i} key={name}>{name}</option>)}</select></label>
      <button type="button" aria-label="Zoom out" disabled={scale <= 0.25} onClick={() => setZoom(Math.max(0.25, scale - 0.25))}>−</button>
      <span>{Math.round(scale * 100)}%</span>
      <button type="button" aria-label="Zoom in" disabled={scale >= 3} onClick={() => setZoom(Math.min(3, scale + 0.25))}>+</button>
      <button type="button" onClick={() => setZoom("fit")}>Fit to width</button>
      {page.rowCount > 100 && <><span>Rows {page.rowStart + 1}–{page.rowStart + page.rows.length} of {page.rowCount}</span>
      <button disabled={loading || !page.rowStart} onClick={() => navigate(sheetIndex, Math.max(0, page.rowStart - 100), page.colStart)}>Previous rows</button>
      <button disabled={loading || page.rowStart + 100 >= page.rowCount} onClick={() => navigate(sheetIndex, page.rowStart + 100, page.colStart)}>Next rows</button></>}
      {page.colCount > 30 && <><button disabled={loading || !page.colStart} onClick={() => navigate(sheetIndex, page.rowStart, Math.max(0, page.colStart - 30))}>Previous columns</button><button disabled={loading || page.colStart + 30 >= page.colCount} onClick={() => navigate(sheetIndex, page.rowStart, page.colStart + 30)}>Next columns</button></>}
    </div>
    {page.styleWarning && <p role="status">{page.styleWarning}</p>}
    <div ref={scrollRef} className="spreadsheet-scroll" tabIndex={0} role="region" aria-label={`${names[sheetIndex]} worksheet`}>
      <div className="spreadsheet-paper-space" style={{ width: paperWidth * scale, height: (paperHeight || page.rows.reduce((sum, row) => sum + row.height, 96)) * scale }}>
        <div ref={paperRef} className="spreadsheet-paper" style={{ width: paperWidth, transform: `scale(${scale})` }}>
          {printBand(page.header, "spreadsheet-print-header")}
          <table aria-label={names[sheetIndex]} style={{ width: paperWidth - 96 }}><colgroup>{page.columnWidths.map((width, i) => <col key={i} style={{ width, visibility: width === 0 ? "collapse" : undefined }} />)}</colgroup>
            <tbody>{page.rows.map(row => <tr key={row.number} style={{ height: row.height, display: row.hidden ? "none" : undefined }}>{row.cells.map(cell => <td key={cell.address} rowSpan={cell.rowSpan} colSpan={cell.colSpan} style={{ ...(cell.fill ? { backgroundColor: cell.fill } : {}), ...cell.style }}>{cell.runs ? cell.runs.map((run, i) => <span key={i} style={run.style}>{run.text}</span>) : cell.text}</td>)}</tr>)}</tbody>
          </table>
          {printBand(page.footer, "spreadsheet-print-footer")}
        </div>
      </div>
    </div>
  </section>;
}
