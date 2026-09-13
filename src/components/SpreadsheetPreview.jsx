import { createSpreadsheetReader } from "../utils/spreadsheetReader";
import { reportIssue } from '../utils/issueReporting';
import { useEffect, useRef, useState } from "react";
import { loadCourseFile } from "../canvasApi";
import { ContentSkeleton } from "./ContentSkeleton";
import { DocumentToolbar, useDocumentFullscreen } from "./DocumentToolbar";
import { documentPageTransform, spreadsheetPageLocation } from "../utils/documentViewer";

export default function SpreadsheetPreview({ courseId, file, sourceBlob }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [rotation, setRotation] = useState(0);
  const stageRef = useRef(null);
  const fullscreen = useDocumentFullscreen(stageRef);
  const workerRef = useRef(null);
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
    setResult(null); setError(""); setLoading(true); setSheetIndex(0); setPageNumber(1); setRotation(0); setZoom("fit");
    const reader = createSpreadsheetReader({
      workerFactory: () => new Worker(new URL("../utils/spreadsheet.worker.js", import.meta.url), { type: "module" }),
      onResult: data => { setResult(data); setLoading(false); setError(""); },
      onError: message => { reportIssue({ area: 'preview', kind: 'spreadsheet', code: 'render' }); setError(message); setLoading(false); },
    });
    workerRef.current = reader;
    reader.open(sourceBlob ? Promise.resolve(sourceBlob) : loadCourseFile(courseId, file.id, file.contentType), file.name);
    return () => reader.dispose();
  }, [courseId, file.id, file.name, file.contentType, sourceBlob, revision]);
  function navigate(number) {
    const location = spreadsheetPageLocation(result.sheets || [{ rows: result.page.rowCount, columns: result.page.colCount }], number);
    setSheetIndex(location.sheetIndex); setPageNumber(location.number); setLoading(true);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    workerRef.current.navigate({ sheetIndex: location.sheetIndex, rowStart: location.rowStart, colStart: location.colStart });
  }
  if (error) return <div className="document-reader-message" role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(v => v + 1)}>Retry preview</button></div>;
  if (!result) return <ContentSkeleton label="Opening spreadsheet from Canvas" variant="document" />;
  const { page, names } = result;
  const paperWidth = page.columnWidths.reduce((sum, width) => sum + width, 0) + 96;
  const naturalHeight = paperHeight || page.rows.reduce((sum, row) => sum + row.height, 96);
  const fitWidth = rotation % 180 ? naturalHeight : paperWidth;
  const scale = zoom === "fit" ? Math.min(1.4, Math.max(0.1, Math.min(920, viewportWidth - 64) / fitWidth)) : zoom;
  const geometry = documentPageTransform(paperWidth, naturalHeight, rotation, scale);
  const pageCount = spreadsheetPageLocation(result.sheets || [{ rows: page.rowCount, columns: page.colCount }]).count;
  function printBand(parts, className) {
    if (!parts || !Object.values(parts).some(runs => runs.length)) return null;
    return <div className={className}>{["left", "center", "right"].map(side => <div key={side} style={{ textAlign: side }}>{parts[side].map((run, i) => <span key={i} style={run.style}>{run.text}</span>)}</div>)}</div>;
  }
  return <section ref={stageRef} className="moofie-pdf spreadsheet-preview" aria-label={file.name} aria-busy={loading}>
    <DocumentToolbar pageNumber={pageNumber} pageCount={pageCount} onPageChange={navigate} disabled={loading}
      scale={scale} autoFit={zoom === "fit"} onZoom={amount => setZoom(Math.max(0.25, Math.min(3, scale + amount)))} onFit={() => setZoom("fit")}
      onRotate={() => setRotation(value => (value + 90) % 360)} fullscreen={fullscreen.fullscreen} onFullscreen={fullscreen.toggle} />
    <div ref={scrollRef} className="moofie-pdf-pages spreadsheet-scroll" tabIndex={0} role="region" aria-label={`${names[sheetIndex]} worksheet`}>
      {(page.styleWarning || fullscreen.error) && <p role="status">{page.styleWarning || fullscreen.error}</p>}
      <div className="spreadsheet-paper-space" style={{ width: geometry.width, height: geometry.height }}>
        <div ref={paperRef} className="moofie-pdf-page spreadsheet-paper" style={{ width: paperWidth, transform: geometry.transform }}>
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
