import { useRef, useState } from "react";
import { loadAssignmentLaunch } from "../canvasApi";
import { openAssignmentLaunch } from "../utils/assignmentLaunch";

export function ExternalAssignmentLaunch({ courseId, assignmentId, title, canvasUrl }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  async function open() {
    if (busy.current) return;
    busy.current = true; setOpening(true); setError("");
    try { await openAssignmentLaunch(() => loadAssignmentLaunch(courseId, assignmentId)); }
    catch (failure) { setError(failure.message || "Could not open the assignment. Please try again."); }
    finally { busy.current = false; setOpening(false); }
  }
  return <div className="external-assignment-launch">
    <button className="external-assignment-link" type="button" onClick={open} disabled={opening}>{opening ? "Opening…" : `Open ${title}`}</button>
    {error && <p role="alert">{error} {canvasUrl && <a href={canvasUrl} target="_blank" rel="noreferrer">Open in Canvas</a>}</p>}
  </div>;
}
