import { useEffect, useState } from "react";
import { loadCoursePeople } from "../canvasApi";
import { ContentSkeleton } from "./ContentSkeleton";
import { CoursePeople } from "./CoursePeople";
import { startCanvasAutoRefresh } from "../utils/canvasSync";

export function CoursePeoplePanel({ courseId, active, people, onOpen }) {
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || people != null) return;
    let current = true;
    const refresh = () => loadCoursePeople(courseId).then(result => { if (current) { setLoaded(result.people); setError(""); } }).catch(error => { if (current) setError(error.message || "People could not be loaded."); });
    if (loaded == null || attempt) { setError(""); refresh(); }
    const stop = startCanvasAutoRefresh(refresh);
    window.addEventListener("moofie:refresh", refresh);
    return () => { current = false; stop(); window.removeEventListener("moofie:refresh", refresh); };
  }, [courseId, active, people, attempt]);
  const roster = people ?? loaded;
  if (error && roster == null) return <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>;
  if (roster == null) return active ? <ContentSkeleton label="Loading people" /> : null;
  return <CoursePeople people={roster} onOpen={onOpen} />;
}
