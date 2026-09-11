import { useEffect, useMemo, useRef, useState } from "react";
import { sanitizeCourseHtml } from "../utils/courseHtml";
import { canvasLinkNavigation } from "../utils/canvasLinks";
import { writeNavigation } from "../utils/navigation";
import { loadCourseFile } from "../canvasApi";

export function SafeCourseHtml({ html, baseUrl }) {
  const root = useRef(null);
  const [error, setError] = useState("");
  const safeHtml = useMemo(() => sanitizeCourseHtml(html, baseUrl), [html, baseUrl]);
  useEffect(() => {
    setError("");
    let active = true;
    const urls = [];
    const requests = new Map();
    root.current?.querySelectorAll("[data-moofie-asset]").forEach(element => {
      const source = element.getAttribute("data-moofie-asset");
      const viewer = canvasLinkNavigation(source, baseUrl)?.moofieViewer;
      if (!viewer) return;
      if (!requests.has(source)) requests.set(source, loadCourseFile(viewer.courseId, viewer.item.id));
      requests.get(source).then(blob => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        element.src = url;
        if (element.tagName === "SOURCE") element.parentElement?.load?.();
      }).catch(() => { if (active) setError("A course image or media file could not load. Refresh to try again."); });
    });
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [safeHtml, baseUrl]);
  function followLink(event) {
    const link = event.target.closest("a[data-moofie-link]");
    if (!link || !root.current?.contains(link)) return;
    event.preventDefault();
    const patch = canvasLinkNavigation(link.getAttribute("data-moofie-link"), baseUrl, link.textContent.trim());
    if (patch) writeNavigation(patch);
    else setError("This Canvas link does not identify a supported course page, file, assignment, quiz, or tool.");
  }
  return <>{safeHtml ? <div ref={root} className="native-course-html" onClick={followLink} dangerouslySetInnerHTML={{ __html: safeHtml }} /> : <p className="native-course-empty">No additional details were provided.</p>}{error && <p role="alert" className="home-resource-error">{error}</p>}</>;
}
