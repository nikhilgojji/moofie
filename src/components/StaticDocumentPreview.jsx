import { useEffect, useRef, useState } from "react";
import { DocumentToolbar, useDocumentFullscreen } from "./DocumentToolbar";
import { documentPageTransform } from "../utils/documentViewer";

export function StaticDocumentPreview({ preview, file }) {
  const stageRef = useRef(null), scrollRef = useRef(null), textRef = useRef(null);
  const fullscreen = useDocumentFullscreen(stageRef);
  const [rotation, setRotation] = useState(0), [zoom, setZoom] = useState("fit");
  const [size, setSize] = useState({ width: 920, height: 600 });
  const [viewport, setViewport] = useState(1000), [error, setError] = useState(false);
  useEffect(() => {
    const measure = () => { setViewport(scrollRef.current?.clientWidth || 1000); if (textRef.current) setSize({ width: 920, height: textRef.current.offsetHeight || 600 }); };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (scrollRef.current) observer.observe(scrollRef.current);
    if (textRef.current) observer.observe(textRef.current);
    return () => observer.disconnect();
  }, [preview.text]);
  const scale = zoom === "fit" ? Math.min(1.4, Math.max(0.1, Math.min(920, viewport - 64) / (rotation % 180 ? size.height : size.width))) : zoom;
  const geometry = documentPageTransform(size.width, size.height, rotation, scale);
  return <section className="moofie-pdf" ref={stageRef} aria-label={`${file.name} document`}>
    <DocumentToolbar pageNumber={1} pageCount={1} onPageChange={() => {}} scale={scale} autoFit={zoom === "fit"}
      onZoom={amount => setZoom(Math.max(0.25, Math.min(3, scale + amount)))} onFit={() => setZoom("fit")}
      onRotate={() => setRotation(value => (value + 90) % 360)} fullscreen={fullscreen.fullscreen} onFullscreen={fullscreen.toggle} />
    <div className="moofie-pdf-pages" ref={scrollRef}>
      {fullscreen.error && <p role="status">{fullscreen.error}</p>}
      {error ? <div role="alert"><p>The image could not load.</p><button onClick={() => { setError(false); preview.retry?.(); }}>Retry preview</button></div> :
        <div className="document-static-space" style={{ width: geometry.width, height: geometry.height }}>
          <div className="moofie-pdf-page document-static-paper" style={{ width: size.width, transform: geometry.transform }}>
            {preview.kind === "image" ? <img src={preview.url} alt={file.name} onLoad={event => setSize({ width: event.target.naturalWidth, height: event.target.naturalHeight })} onError={() => setError(true)} /> : <pre ref={textRef} className="document-static-text">{preview.text}</pre>}
          </div>
        </div>}
    </div>
  </section>;
}
