import { useRef, useState } from "react";
import { loadAssignmentLaunch, loadModuleLaunch } from "../canvasApi";
import { openAssignmentLaunch } from "../utils/assignmentLaunch";

export function ExternalAssignmentLaunch({ courseId, assignmentId, moduleId, moduleItemId, title, canvasUrl, children, className = "external-assignment-link" }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  async function open() {
    if (busy.current) return;
    busy.current = true; setOpening(true); setError("");
    try { await openAssignmentLaunch(() => moduleItemId ? loadModuleLaunch(courseId, moduleId, moduleItemId) : loadAssignmentLaunch(courseId, assignmentId)); }
    catch (failure) { setError(failure.message || "Could not open the assignment. Please try again."); }
    finally { busy.current = false; setOpening(false); }
  }
  return <div className={moduleItemId ? "external-module-launch" : "external-assignment-launch"}>
    <button className={className} type="button" onClick={open} disabled={opening} aria-busy={opening}>{children || (opening ? "Opening…" : `Open ${title}`)}</button>
    {error && <p role="alert">{error} {canvasUrl && <a href={canvasUrl} target="_blank" rel="noreferrer">Open in Canvas</a>}</p>}
  </div>;
}
