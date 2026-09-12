import { useEffect, useRef, useState } from "react";
import { loadCourseFile } from "../canvasApi";
import { ContentSkeleton } from "./ContentSkeleton";

export default function SpreadsheetPreview({ courseId, file }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [sheetIndex, setSheetIndex] = useState(0);
  const workerRef = useRef(null);
  const requestRef = useRef(0);
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
    loadCourseFile(courseId, file.id, file.contentType).then(async blob => {
      if (blob.size > 25 * 1024 * 1024) throw new Error("This workbook exceeds the 25 MB preview limit. Download the original file to view it.");
      const bytes = await blob.arrayBuffer();
      if (active) worker.postMessage({ bytes, requestId: ++requestRef.current }, [bytes]);
    }).catch(failure => { clearTimeout(timer); if (active) { setError(failure.message); setLoading(false); } });
    return () => { active = false; clearTimeout(timer); worker.terminate(); };
  }, [courseId, file.id, file.contentType, revision]);
  function navigate(sheet, rowStart = 0, colStart = 0) {
    setSheetIndex(sheet); setLoading(true);
    workerRef.current.postMessage({ sheetIndex: sheet, rowStart, colStart, requestId: ++requestRef.current });
  }
  if (error) return <div className="document-reader-message" role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(v => v + 1)}>Retry preview</button></div>;
  if (!result) return <ContentSkeleton label="Opening spreadsheet from Canvas" variant="document" />;
  const { page, names } = result;
  return <section className="spreadsheet-preview" aria-label={file.name} aria-busy={loading}>
    <div className="spreadsheet-controls">
      <label>Worksheet <select value={sheetIndex} onChange={e => navigate(Number(e.target.value))}>{names.map((name, i) => <option value={i} key={name}>{name}</option>)}</select></label>
      <span>Rows {page.rowStart + 1}–{page.rowStart + page.rows.length} of {page.rowCount}</span>
      <button disabled={loading || !page.rowStart} onClick={() => navigate(sheetIndex, Math.max(0, page.rowStart - 100), page.colStart)}>Previous rows</button>
      <button disabled={loading || page.rowStart + 100 >= page.rowCount} onClick={() => navigate(sheetIndex, page.rowStart + 100, page.colStart)}>Next rows</button>
      {page.colCount > 30 && <><button disabled={loading || !page.colStart} onClick={() => navigate(sheetIndex, page.rowStart, Math.max(0, page.colStart - 30))}>Previous columns</button><button disabled={loading || page.colStart + 30 >= page.colCount} onClick={() => navigate(sheetIndex, page.rowStart, page.colStart + 30)}>Next columns</button></>}
    </div>
    <div className="spreadsheet-scroll" tabIndex={0} role="region" aria-label={`${names[sheetIndex]} worksheet`}>
      <table><thead><tr><th aria-label="Row" />{page.columns.map(col => <th key={col} scope="col">{col}</th>)}</tr></thead>
        <tbody>{page.rows.map(row => <tr key={row.number}><th scope="row">{row.number}</th>{row.cells.map(cell => <td key={cell.address} rowSpan={cell.rowSpan} colSpan={cell.colSpan} style={cell.fill ? { backgroundColor: cell.fill, color: "#171717" } : undefined}>{cell.text}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </section>;
}
