import { ContentSkeleton } from "./ContentSkeleton";
import { useEffect, useMemo, useState } from "react";
import { loadCourseTool } from "../canvasApi";
import { CourseToolIcon } from "./CourseToolIcon";
import { startCanvasAutoRefresh } from "../utils/canvasSync";

function PolicyDocument({ url, title }) {
  const [loading, setLoading] = useState(true);
  return <div className="policy-document">
    {loading && <ContentSkeleton label="Loading policy document" variant="document" />}
    <iframe src={url} title={`${title} document`} className="policy-document-frame" allowFullScreen onLoad={() => setLoading(false)} referrerPolicy="no-referrer" />
  </div>;
}

export function CourseTool({ courseId, toolId, title, renderPdf }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    const refresh = () => setAttempt(value => value + 1);
    window.addEventListener("moofie:refresh", refresh);
    const stop = state.error ? startCanvasAutoRefresh(refresh) : () => {};
    return () => { stop(); window.removeEventListener("moofie:refresh", refresh); };
  }, [state.error]);
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    if (!toolId) {
      setState({ error: "This course tab does not provide content Moofie can open yet." });
      return;
    }
    loadCourseTool(courseId, toolId)
      .then(result => { if (active) setState(result); })
      .catch(error => { if (active) setState({ error: error.message || "Could not connect to this tool." }); });
    return () => { active = false; };
  }, [courseId, toolId, attempt]);
  const pdf = useMemo(() => state.kind === "pdf" ? new Blob([Uint8Array.from(atob(state.data), character => character.charCodeAt(0))], { type: "application/pdf" }) : null, [state]);
  if (state.loading) return <ContentSkeleton label={`Loading ${title}`} variant={/policy/i.test(title) ? "document" : "list"} />;
  if (state.error) return <div><p role="alert">{state.error}</p>{toolId && <button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button>}</div>;
  if (pdf) return renderPdf(pdf, title);
  if (state.kind === "policy-embed") return <PolicyDocument key={state.url} url={state.url} title={title} />;
  if (state.kind === "grades") return <div className="native-course-html"><table><thead><tr>{state.rows[0].map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead><tbody>{state.rows.slice(1).map((row, index) => <tr key={index}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>;
  if (state.kind === "macmillan") {
    const descriptions = ["Access the Achieve homepage.", "Run diagnostics on your Macmillan Learning connection.", "Having problems? Contact Macmillan technical support.", "View your Macmillan profile information or reset the mapping to your Macmillan account."];
    return <div className="macmillan-menu"><h3>Macmillan Learning Tools</h3>{state.links.map((link, index) => <div className="macmillan-menu-item" key={link.label}><CourseToolIcon index={index} src={link.iconUrl} /><div>{link.url ? <a href={link.url} target="_blank" rel="noreferrer">{link.label}</a> : <strong>{link.label}</strong>}<p>{descriptions[index]}</p>{!link.url && <small>This link was not included in the service response.</small>}</div></div>)}</div>;
  }
  if (state.kind === "policy") return <div className="native-course-html">{state.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
  return <p role="alert">The service did not return readable content.</p>;
}
