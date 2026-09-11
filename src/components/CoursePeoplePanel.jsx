import { useEffect, useState } from "react";
import { loadCoursePeople } from "../canvasApi";
import { ContentSkeleton } from "./ContentSkeleton";
import { CoursePeople } from "./CoursePeople";

export function CoursePeoplePanel({ courseId, active, people, onOpen }) {
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || people != null || loaded != null) return;
    let current = true;
    setError("");
    loadCoursePeople(courseId).then(result => { if (current) setLoaded(result.people); }).catch(error => { if (current) setError(error.message || "People could not be loaded."); });
    return () => { current = false; };
  }, [courseId, active, people, loaded, attempt]);
  const roster = people ?? loaded;
  if (error) return <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>;
  if (roster == null) return active ? <ContentSkeleton label="Loading people" /> : null;
  return <CoursePeople people={roster} onOpen={onOpen} />;
}
